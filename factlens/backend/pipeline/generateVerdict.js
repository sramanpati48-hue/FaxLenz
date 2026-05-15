// generateVerdict.js — Generate final verdict using Groq (llama-3.1-8b-instant)
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async function generateVerdict(claimsWithEvidence) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Missing GROQ_API_KEY');
  }

  const claims = claimsWithEvidence.claims || [];
  const evidence = claimsWithEvidence.evidence || {};
  const evidenceStr = JSON.stringify(evidence).slice(0, 500);

  const prompt = `You are a decisive fact-checker. Review the claims and the evidence, then produce a single, final JSON verdict. Do NOT hedge. If you know from training data that a claim is true or false, state it confidently with high confidence even if there are no external sources. Make a definitive judgment based on available evidence and your knowledge. Be concise — max 2 sentences, no repetition.` +
    `\n\nClaims: ${JSON.stringify(claims)}\n\nEvidence: ${evidenceStr}\n\nReply ONLY with this JSON object (no markdown, no extra commentary):\n{\"verdict\":\"Verified|False|Misleading|Disputed\",\"confidence\":90,\"explanation\":\"concise explanation (max 2 short sentences; do not repeat points)\",\"sources\":[]}`

  function extractJsonObject(text) {
    const start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const character = text[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === '\\') {
        escaped = true;
        continue;
      }

      if (character === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (character === '{') depth += 1;
      if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          return text.slice(start, index + 1);
        }
      }
    }

    return null;
  }

  try {
    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 1
    });
    const text_response = result.choices[0]?.message?.content || '';
    console.log('Groq verdict raw response:', text_response);

    const jsonText = extractJsonObject(String(text_response));
    if (!jsonText) {
      console.warn('Could not parse verdict from Groq response');
      return {
        verdict: 'Disputed',
        confidence: 40,
        explanation: String(text_response).slice(0, 200) || 'Could not generate verdict',
        sources: []
      };
    }

    const verdict = JSON.parse(jsonText);
    const confidence = Math.max(40, Math.min(100, Number(verdict.confidence || 40)));
    return {
      verdict: String(verdict.verdict || 'Disputed').trim(),
      confidence,
      explanation: String(verdict.explanation || '').slice(0, 200),
      sources: Array.isArray(verdict.sources) ? verdict.sources : []
    };
  } catch (err) {
    console.error('Groq generateVerdict error:', err && err.message ? err.message : String(err));
    return {
      verdict: 'Disputed',
      confidence: 40,
      explanation: err && err.message ? String(err.message).slice(0, 200) : 'Unable to generate verdict',
      sources: []
    };
  }
};
