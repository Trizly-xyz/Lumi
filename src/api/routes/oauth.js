const router = require('express').Router();
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger');

const SITE_BASE = (process.env.DOMAIN || 'https://trizly.xyz').replace(/\/$/, '');
const API_BASE = (process.env.PUBLIC_API_BASE || '').replace(/\/$/, '');

function isSnowflake(id) {
  return /^\d{17,19}$/.test(id || '');
}

function parseState(raw) {
  if (!raw) return { discordId: null, guildId: null, nonce: null, sessionId: null };
  const parts = String(raw).split(':');
  return { 
    discordId: parts[0] || null, 
    guildId: parts[1] || null, 
    nonce: parts[2] || null,
    sessionId: parts[3] || null
  };
}

function buildPublicBase(req) {
  if (API_BASE) return API_BASE;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['host'];
  if (host) return `${proto}://${host}`;
  return SITE_BASE;
}

function buildWebhookUrl(req) {
  if (process.env.VERIFY_WEBHOOK_URL) return process.env.VERIFY_WEBHOOK_URL;
  const base = buildPublicBase(req);
  return `${base}/lumi/verify/complete`;
}

function buildSuccessRedirect() {
  return `${SITE_BASE}/verify/success`;
}

router.post('/callback', async (req, res) => {
  const { code, state } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing Discord OAuth code' });
  if (!state) return res.status(400).json({ error: 'Missing state' });

  const { discordId, guildId } = parseState(state);
  if (!isSnowflake(discordId) || !isSnowflake(guildId)) {
    return res.status(400).json({ error: 'Invalid state format' });
  }

  try {
    const tokenForm = new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${SITE_BASE}/verify/callback`
    });

    const tokenRes = await axios.post('https://discord.com/api/oauth2/token', tokenForm, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000
    });

    if (tokenRes.data?.access_token) {

      const sessionId = crypto.randomUUID();
      req.app.locals.discordTokens = req.app.locals.discordTokens || {};
      req.app.locals.discordTokens[sessionId] = {
        discordId,
        accessToken: tokenRes.data.access_token,
        refreshToken: tokenRes.data.refresh_token,
        expiresIn: tokenRes.data.expires_in,
        timestamp: Date.now()
      };

      const now = Date.now();
      Object.keys(req.app.locals.discordTokens).forEach(sid => {
        if (now - req.app.locals.discordTokens[sid].timestamp > 600000) {
          delete req.app.locals.discordTokens[sid];
        }
      });

      const nonce = crypto.randomUUID().slice(0, 8);
      const enrichedState = `${discordId}:${guildId}:${nonce}:${sessionId}`;
      const base = buildPublicBase(req);
      const nextRobloxStartUrl = `${base}/lumi/verify/roblox/start?state=${encodeURIComponent(enrichedState)}`;

      return res.json({ status: 'ok', state: enrichedState, nextRobloxStartUrl });
    }
  } catch (err) {
    logger.error('Discord token exchange failed', { error: err.message });

  }

  const nonce = crypto.randomUUID().slice(0, 8);
  const enrichedState = `${discordId}:${guildId}:${nonce}`;
  const base = buildPublicBase(req);
  const nextRobloxStartUrl = `${base}/lumi/verify/roblox/start?state=${encodeURIComponent(enrichedState)}`;

  return res.json({ status: 'ok', state: enrichedState, nextRobloxStartUrl });
});

router.get('/callback', (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  if (!code || !state) return res.status(400).json({ error: 'Missing code or state' });
  const { discordId, guildId } = parseState(state);
  if (!isSnowflake(discordId) || !isSnowflake(guildId)) return res.status(400).json({ error: 'Invalid state format' });
  const nonce = crypto.randomUUID().slice(0, 8);
  const enrichedState = `${discordId}:${guildId}:${nonce}`;
  const base = buildPublicBase(req);
  const nextRobloxStartUrl = `${base}/lumi/verify/roblox/start?state=${encodeURIComponent(enrichedState)}`;
  return res.redirect(nextRobloxStartUrl);
});

router.get('/roblox/start', (req, res) => {
  let state = req.query.state || null;
  if (!state) {
    const discordId = req.query.discordId;
    const guildId = req.query.guildId;
    if (discordId && guildId) {
      const nonce = crypto.randomUUID().slice(0, 8);
      state = `${discordId}:${guildId}:${nonce}`;
    }
  }
  if (!state) {
    const nonce = crypto.randomUUID().slice(0, 8);
    state = `0:0:${nonce}`;
  }

  const parsed = parseState(state);
  if (!parsed.discordId || !parsed.guildId) {
    const nonce = crypto.randomUUID().slice(0, 8);
    state = `${parsed.discordId || '0'}:${parsed.guildId || '0'}:${nonce}`;
  }

  const params = new URLSearchParams({
    client_id: process.env.ROBLOX_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.ROBLOX_REDIRECT_URI,
    scope: 'openid profile',
    state
  });

  const redirectUrl = `https://apis.roblox.com/oauth/v1/authorize?${params}`;
  return res.redirect(redirectUrl);
});

router.get('/roblox/callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  if (!code) return res.status(400).json({ error: 'Missing code' });
  if (!state) return res.status(400).json({ error: 'Missing state' });

  const { discordId, guildId } = parseState(state);
  if (!isSnowflake(discordId) || !isSnowflake(guildId)) {
    return res.status(400).json({ error: 'Invalid state' });
  }

  try {
    const form = new URLSearchParams();
    form.append('grant_type', 'authorization_code');
    form.append('code', code);
    form.append('redirect_uri', process.env.ROBLOX_REDIRECT_URI);

    const basic = Buffer.from(`${process.env.ROBLOX_CLIENT_ID}:${process.env.ROBLOX_CLIENT_SECRET}`).toString('base64');

    const tokenRes = await axios.post('https://apis.roblox.com/oauth/v1/token', form, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Accept': 'application/json',
        'Authorization': `Basic ${basic}`
      },
      timeout: parseInt(process.env.CALLBACK_TIMEOUT_MS || '10000', 10)
    });

    if (!tokenRes.data?.access_token) {
      return res.status(500).json({ error: 'Roblox token missing' });
    }

    const userRes = await axios.get('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
      timeout: parseInt(process.env.CALLBACK_TIMEOUT_MS || '10000', 10)
    });

    const user = userRes.data || {};
    const payload = {
      discordId,
      guildId,
      robloxId: user.sub,
      robloxUsername: user.name,
      isSynthetic: false
    };

    const webhookUrl = buildWebhookUrl(req);
    try {
      await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Verify-Secret': process.env.VERIFY_WEBHOOK_SECRET
        },
        timeout: parseInt(process.env.CALLBACK_TIMEOUT_MS || '10000', 10)
      });
    } catch (err) {
      logger.error('Webhook dispatch failed', { error: err.message, url: webhookUrl });

    }

    const redirectUrl = new URL(buildSuccessRedirect());
    if (user.picture) redirectUrl.searchParams.set('avatar', user.picture);
    if (user.name) redirectUrl.searchParams.set('displayName', user.name);
    if (user.preferred_username) redirectUrl.searchParams.set('username', user.preferred_username);
    if (user.sub) redirectUrl.searchParams.set('userId', user.sub);

    return res.redirect(redirectUrl.toString());
  } catch (err) {
    logger.error('Roblox callback failed', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
