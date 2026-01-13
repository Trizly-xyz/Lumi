

const logger = require('./logger');

function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> array of timestamps
  return function rateLimit(req, res, next) {
    const key = `${req.body && req.body.discordId || 'unknown'}:${req.ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const arr = hits.get(key) || [];

    while (arr.length && arr[0] < windowStart) arr.shift();
    if (arr.length >= max) {
      logger.warn('Rate limit exceeded', { key });
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}

module.exports = { createRateLimiter };
