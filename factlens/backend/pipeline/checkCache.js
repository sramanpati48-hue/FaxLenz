// checkCache.js — Check Upstash Redis cache for verdict
const { Redis } = require('@upstash/redis');

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = (upstashUrl && upstashToken) ? new Redis({ url: upstashUrl, token: upstashToken }) : null;

module.exports = async function checkCache(claimHash) {
  if (!redis || !claimHash) return null;
  try {
    const cached = await redis.get(`factlens:verdict:${claimHash}`);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    console.error('Cache lookup error:', err.message);
    return null;
  }
};
