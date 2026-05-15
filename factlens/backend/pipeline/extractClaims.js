// extractClaims.js — Extract factual claims using Groq (llama-3.1-8b-instant)
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async function extractClaims(text) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Missing GROQ_API_KEY');
  }

  const prompt = `Extract the distinct factual claims from the following text as a JSON array of short strings. Each claim should be atomic and testable. Respond ONLY with valid JSON array.\n\nText:\n${text}\n\nExample output: ["Claim 1", "Claim 2", "Claim 3"]`;

  function extractJsonArray(text) {
    const start = text.indexOf('[');
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

      if (character === '[') depth += 1;
      if (character === ']') {
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
    console.log('Groq extractClaims raw response:', text_response);

    const jsonText = extractJsonArray(String(text_response));
    if (!jsonText) {
      console.warn('Could not parse claims from Groq response');
      return [text.slice(0, 300) || 'Unable to extract claims'];
    }

    const claims = JSON.parse(jsonText);
    const normalizedClaims = Array.isArray(claims) ? claims.map(String).filter(Boolean).slice(0, 10) : [];
    return normalizedClaims.length > 0 ? normalizedClaims : [text.slice(0, 300) || 'Unable to extract claims'];
  } catch (err) {
    console.error('Groq extractClaims error:', err && err.message ? err.message : String(err));
    return [text.slice(0, 300) || 'Unable to extract claims'];
  }
};
