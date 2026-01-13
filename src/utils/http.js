const axios = require('axios');
const logger = require('./logger');

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function requestWithRetry(config, retries = 3, baseDelay = 300) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios(config);
    } catch (err) {
      const status = err.response && err.response.status;
      const retryable = (status && status >= 500) || status === 429 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
      if (attempt === retries || !retryable) {
        if (status !== 404) {
          logger.error('HTTP request failed', { url: config.url, attempt, status, error: err.message });
        }
        throw err;
      }
      const delay = baseDelay * Math.pow(2, attempt);
      logger.warn('Retrying HTTP request', { url: config.url, attempt: attempt + 1, delay });
      await sleep(delay);
    }
  }
}

async function exchangeRobloxCode({ code }) {
  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', process.env.ROBLOX_REDIRECT_URI);

  const basic = Buffer.from(`${process.env.ROBLOX_CLIENT_ID}:${process.env.ROBLOX_CLIENT_SECRET}`).toString('base64');

  return requestWithRetry({
    method: 'POST',
    url: 'https://apis.roblox.com/oauth/v1/token',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Accept': 'application/json',
      'Authorization': `Basic ${basic}`,
      'User-Agent': 'TrizlyVerification/1.0'
    },
    timeout: parseInt(process.env.CALLBACK_TIMEOUT_MS || '10000', 10),
    data: params
  });
}

async function fetchRobloxUser(accessToken) {
  return requestWithRetry({
    method: 'GET',
    url: 'https://apis.roblox.com/oauth/v1/userinfo',
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'TrizlyVerification/1.0' },
    timeout: parseInt(process.env.CALLBACK_TIMEOUT_MS || '10000', 10)
  });
}

async function getRobloxUserById(userId) {
  return requestWithRetry({
    method: 'GET',
    url: `https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`,
    headers: { 'User-Agent': 'TrizlyVerification/1.0', 'Accept': 'application/json' },
    timeout: 10000
  });
}

async function resolveRobloxUsername(username) {
  return requestWithRetry({
    method: 'POST',
    url: 'https://users.roblox.com/v1/usernames/users',
    headers: { 'User-Agent': 'TrizlyVerification/1.0', 'Content-Type': 'application/json', 'Accept': 'application/json' },
    data: { usernames: [username], excludeBannedUsers: false },
    timeout: 10000
  });
}

async function getRobloxAvatarHeadshot(userId, size = '420x420') {
  const params = new URLSearchParams({
    userIds: String(userId),
    size,
    format: 'Png',
    isCircular: 'false'
  });
  return requestWithRetry({
    method: 'GET',
    url: `https://thumbnails.roblox.com/v1/users/avatar-bust?${params.toString()}`,
    headers: { 'User-Agent': 'TrizlyVerification/1.0', 'Accept': 'application/json' },
    timeout: 10000
  });
}

module.exports = { exchangeRobloxCode, fetchRobloxUser, getRobloxUserById, resolveRobloxUsername, getRobloxAvatarHeadshot };
