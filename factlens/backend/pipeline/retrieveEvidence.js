// retrieveEvidence.js — Retrieve evidence using Google Fact Check Tools API
const axios = require('axios');

module.exports = async function retrieveEvidence(claims) {
  if (!process.env.GOOGLE_FACT_CHECK_API_KEY) {
    return {
      error: 'Missing GOOGLE_FACT_CHECK_API_KEY',
      claims: claims,
      evidence: []
    };
  }

  try {
    const apiKey = process.env.GOOGLE_FACT_CHECK_API_KEY;
    const evidence = [];

    // Fetch fact checks for each claim in parallel
    const results = await Promise.all(
      claims.map(async (claim) => {
        try {
          const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search`;
          const params = {
            key: apiKey,
            query: claim
          };
          
          const response = await axios.get(url, { params, timeout: 10000 });
          return {
            claim,
            factChecks: response.data.claims || [],
            error: null
          };
        } catch (err) {
          console.error(`Error fetching evidence for claim "${claim}":`, err.message);
          return {
            claim,
            factChecks: [],
            error: err.message
          };
        }
      })
    );

    return {
      claims,
      evidence: results,
      totalResults: results.reduce((sum, r) => sum + r.factChecks.length, 0)
    };
  } catch (err) {
    console.error('retrieveEvidence error:', err.message);
    // Never throw - return empty evidence and continue
    return {
      claims,
      evidence: claims.map(claim => ({claim, factChecks: [], error: err.message})),
      totalResults: 0,
      error: err.message
    };
  }
};
