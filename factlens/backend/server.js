// Express API for /verify — Groq, Google Fact Check Tools, and Upstash Redis
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const { Redis } = require('@upstash/redis');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const Groq = require('groq-sdk');

const app = express();
const port = process.env.PORT || 3000;

// Upstash REST redis client
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = (upstashUrl && upstashToken) ? new Redis({ url: upstashUrl, token: upstashToken }) : null;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(bodyParser.json());

// Rate limiting: max 50 requests per hour per IP
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// Initialize Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callGroqExtractClaims(text) {
  if (!process.env.GROQ_API_KEY) throw new Error('Missing GROQ_API_KEY');
  const prompt = `Extract the distinct factual claims from the following text as a JSON array of short strings. Respond ONLY with valid JSON.\n\nText:\n${text}\n\nExample: ["Claim 1", "Claim 2"]`;
  try {
    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500
    });
    const responseText = result.choices[0]?.message?.content || '';
    const jsonMatch = responseText.match(/\[.*\]/s);
    if (!jsonMatch) return [text.slice(0, 300)];
    const arr = JSON.parse(jsonMatch[0]);
    return Array.isArray(arr) ? arr.map(String).slice(0, 10) : [text.slice(0, 300)];
  } catch (err) {
    throw new Error('Groq extract error: ' + (err.message || err));
  }
}

async function callGoogleFCT(text) {
  const key = process.env.GOOGLE_FACT_CHECK_API_KEY;
  if (!key) return { error: 'Missing GOOGLE_FACT_CHECK_API_KEY', claims: [] };
  try {
    const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search`;
    const resp = await axios.get(url, {
      params: { key, query: text },
      timeout: 10000
    });
    return resp.data;
  } catch (err) {
    return { error: 'Google FCT error: ' + (err.message || err), claims: [] };
  }
}

async function callGroqVerdict(claims, evidence) {
  if (!process.env.GROQ_API_KEY) throw new Error('Missing GROQ_API_KEY');
  
  // Handle empty evidence - ask Groq to use its own knowledge
  const hasEvidence = evidence && (evidence.googleFCT && evidence.googleFCT.claims && evidence.googleFCT.claims.length > 0);
  const evidenceText = hasEvidence 
    ? JSON.stringify(evidence, null, 2)
    : '(No fact-check evidence available - generate verdict based on your knowledge)';
  
  const prompt = `You are a fact-checking assistant. Analyze the claims to generate a verdict.
${hasEvidence ? 'Use the evidence provided.' : 'No external evidence is available, so use your own knowledge.'}

Claims:
${JSON.stringify(claims, null, 2)}

Evidence:
${evidenceText}

Respond with ONLY a JSON object:
{
  "verdict": "Verified"|"Misleading"|"Disputed"|"False",
  "confidence": <40-100>,
  "explanation": "<brief, max 2 sentences>",
  "sources": ["<source1>", "<source2>"]
}`;
  try {
    console.log('Calling Groq with model:', 'llama-3.3-70b-versatile');
    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500
    });
    const responseText = result.choices[0]?.message?.content || '';
    console.log('Groq response:', responseText.substring(0, 200));
    const jsonMatch = responseText.match(/\{.*\}/s);
    if (!jsonMatch) {
      console.error('No JSON found in response:', responseText);
      throw new Error('Could not parse Groq response');
    }
    const obj = JSON.parse(jsonMatch[0]);
    console.log('Parsed verdict:', obj.verdict);
    // Ensure confidence is at least 40
    if (obj.confidence) {
      obj.confidence = Math.max(40, Math.min(100, Number(obj.confidence)));
    } else {
      obj.confidence = 40;
    }
    return obj;
  } catch (err) {
    console.error('Groq verdict error:', err.message, err.status, err.code);
    // Return safe fallback instead of throwing
    return {
      verdict: 'Disputed',
      confidence: 40,
      explanation: 'Unable to generate verdict, requiring further review',
      sources: []
    };
  }
}

app.post('/verify', async (req, res) => {
  try {
    const text = (req.body && req.body.text) ? String(req.body.text).trim() : '';
    if (!text) return res.status(400).json({ error: 'Missing text field' });

    const key = 'factlens:verdict:' + sha256(text);
    
    // Check Upstash cache
    if (redis) {
      try {
        const cached = await redis.get(key);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            return res.json(Object.assign({ cached: true }, parsed));
          } catch (e) {
            // continue if parse fails
          }
        }
      } catch (e) {
        console.error('Upstash get error', e.message);
      }
    }

    // Extract claims via Groq
    let claims = [];
    try {
      claims = await callGroqExtractClaims(text);
    } catch (e) {
      console.error('extractClaims failed', e.message);
      claims = [text.slice(0, 400)];
    }

    // Retrieve evidence from Google Fact Check Tools
    let evidence = { googleFCT: { claims: [], error: null } };
    try {
      evidence.googleFCT = await callGoogleFCT(text);
    } catch (e) {
      evidence.googleFCT = { error: e.message || String(e), claims: [] };
    }

    // Generate final verdict with Groq
    let verdictObj = { verdict: 'Disputed', confidence: 40, explanation: 'Review required', sources: [] };
    try {
      verdictObj = await callGroqVerdict(claims, evidence);
    } catch (e) {
      console.error('generateVerdict failed', e.message);
    }

    const normalizedVerdict = (String(verdictObj.verdict || 'Disputed')).trim();
    const confidence = Number(verdictObj.confidence || 40);
    const explanation = String(verdictObj.explanation || '').split('\n').slice(0, 2).join(' ');
    const sources = Array.isArray(verdictObj.sources)
      ? verdictObj.sources
      : (verdictObj.sources ? [String(verdictObj.sources)] : []);

    const out = {
      verdict: normalizedVerdict,
      confidence: Math.max(40, Math.min(100, Math.round(confidence))),
      explanation,
      sources
    };

    // Cache in Upstash
    if (redis) {
      try {
        await redis.set(key, JSON.stringify(out), { ex: TTL_SECONDS });
      } catch (e) {
        console.error('Upstash set error', e.message);
      }
    }

    return res.json(out);
  } catch (err) {
    console.error('verify handler error', err && err.stack || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/debug-groq', async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'Missing GROQ_API_KEY' });
    }

    const { prompt } = req.body || {};
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: 'Missing prompt field' });
    }

    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: String(prompt) }],
      max_tokens: 500
    });
    const raw = result.choices[0]?.message?.content || '';

    return res.json({ raw });
  } catch (err) {
    console.error('debug-groq handler error', err && err.stack || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/debug-env', (req, res) => {
  res.json({
    hasGroqKey: !!process.env.GROQ_API_KEY,
    groqKeyPrefix: process.env.GROQ_API_KEY 
      ? process.env.GROQ_API_KEY.substring(0,8) : 'MISSING',
    hasFactCheckKey: !!process.env.GOOGLE_FACT_CHECK_API_KEY,
    hasRedisUrl: !!process.env.UPSTASH_REDIS_REST_URL,
    nodeEnv: process.env.NODE_ENV
  });
});

app.get('/', (req, res) =>
  res.send('FactLens backend — /verify POST endpoint (Groq llama-3.3-70b-versatile + Google Fact Check Tools + Upstash Redis)')
);

app.listen(port, () => console.log(`FactLens backend listening on http://localhost:${port}`));
