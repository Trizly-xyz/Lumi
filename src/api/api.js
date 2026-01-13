const express = require('express');
const cors = require("cors");
const verificationRoutes = require('./routes/oauth');
const lookupRoutes = require('./routes/lookup');
const { signatureCheck } = require('../utils/security');
const crypto = require('crypto');
const logger = require('../utils/logger');
const VerifiedUser = require('../models/verifiedUser');

module.exports = function startApi(eventBus) {
  const app = express();

  const allowedOrigins = [
    "https://trizly.xyz",
    "https://www.trizly.xyz",
    "http://trizly.xyz",
    "http://www.trizly.xyz",
    "https://api.trizly.xyz"
  ];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Verify-Secret", "X-Verification-Sig"],
    credentials: false,
  }));

  app.use((req, res, next) => {
    req.reqId = crypto.randomUUID().slice(0, 8);
    const start = Date.now();
    logger.info('Request started', { id: req.reqId, method: req.method, url: req.originalUrl });
    res.on('finish', () => {
      logger.info('Request completed', { id: req.reqId, status: res.statusCode, ms: Date.now() - start });
    });
    next();
  });

  app.use((req, res, next) => {
    req.eventBus = eventBus;
    next();
  });

  app.use(express.json({ limit: '50kb' }));

  const { createRateLimiter } = require('../utils/rateLimit');

  const webhookRateLimiter = createRateLimiter({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10)
  });

  app.post("/verify/complete",
    webhookRateLimiter,
    async (req, res) => {
  logger.info("Verification webhook received");
  logger.info("Webhook headers", { headers: req.headers });
  logger.info("Webhook payload", { body: req.body });
  logger.info("Webhook context", { discordId: req.body?.discordId, guildId: req.body?.guildId });
  
  const secret = req.headers["x-verify-secret"];
  logger.info("Webhook authentication", { 
    secretReceived: !!secret, 
    secretExpected: !!process.env.VERIFY_WEBHOOK_SECRET,
    secretMatch: secret === process.env.VERIFY_WEBHOOK_SECRET 
  });
  
  if (!secret || secret !== process.env.VERIFY_WEBHOOK_SECRET) {
    logger.warn("Webhook authentication failed", { ip: req.ip, secret: secret?.substring(0, 5) + '...' });
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { discordId, guildId, robloxId, robloxUsername, isSynthetic, discordAccessToken, discordRefreshToken, discordTokenExpiresIn, discordTokenTimestamp } = req.body;

  if (!discordId || !guildId || !robloxId) {
    logger.error("Missing required fields");
    return res.status(400).json({ error: "Missing required fields" });
  }

  const discordIdRegex = /^\d{17,19}$/;
  if (!discordIdRegex.test(discordId) || !discordIdRegex.test(guildId)) {
    logger.error("Invalid Discord ID format");
    return res.status(400).json({ error: "Invalid ID format" });
  }

  if (!/^\d+$/.test(robloxId)) {
    logger.error("Invalid Roblox ID format");
    return res.status(400).json({ error: "Invalid Roblox ID" });
  }

  const sanitizedUsername = (robloxUsername || '').replace(/[^a-zA-Z0-9_]/g, '');
  if (!sanitizedUsername || sanitizedUsername.length === 0) {
    logger.error("Invalid Roblox username");
    return res.status(400).json({ error: "Invalid username" });
  }

  try {
    logger.info("Starting verification persistence");

    const updateData = {
      robloxId,
      username: sanitizedUsername,
      verifiedAt: new Date()
    };

    if (discordAccessToken) {
      const expiryDate = new Date((discordTokenTimestamp || Date.now()) + ((discordTokenExpiresIn || 604800) * 1000));
      updateData.discordAccessToken = discordAccessToken;
      updateData.discordRefreshToken = discordRefreshToken;
      updateData.discordTokenExpiry = expiryDate;
      
      logger.info("Stored Discord OAuth tokens", { discordId, expiresAt: expiryDate });
    } else {

      const tokenData = req.app.locals.discordTokens?.[discordId];
      if (tokenData && tokenData.accessToken) {
        const expiryDate = new Date(tokenData.timestamp + (tokenData.expiresIn * 1000));
        updateData.discordAccessToken = tokenData.accessToken;
        updateData.discordRefreshToken = tokenData.refreshToken;
        updateData.discordTokenExpiry = expiryDate;

        delete req.app.locals.discordTokens[discordId];
        
        logger.info("Stored Discord OAuth tokens from session", { discordId, expiresAt: expiryDate });
      }
    }

    const verifiedUser = await VerifiedUser.findOneAndUpdate(
      { discordId },
      updateData,
      { upsert: true, new: true }
    );

    logger.info("User verification persisted", {
      discordId,
      robloxId,
      username: sanitizedUsername,
      guildId,
      dbId: verifiedUser._id
    });

    logger.info("Emitting userVerified event", {
      discordId,
      guildId,
      robloxId,
      username: sanitizedUsername
    });
    
    try {
      req.eventBus.emit("userVerified", {
        discordId,
        guildId,
        robloxId,
        username: sanitizedUsername
      });
    } catch (emitErr) {
      logger.error('Event emission failed', { error: emitErr.message, stack: emitErr.stack });
    }

    logger.info("Event emitted successfully");

    const response = { 
      status: "ok", 
      saved: true,
      delivered: true,
      verifiedUser: {
        discordId: verifiedUser.discordId,
        robloxId: verifiedUser.robloxId,
        username: verifiedUser.username
      }
    };
    
    logger.info("Sending success response", response);
    return res.json(response);

  } catch (err) {
    logger.error("Verification processing failed", { error: err.message, stack: err.stack });
    return res.status(500).json({ error: "Verification failed" });
  }
});

  app.get('/', (req, res) => {
    res.json({ status: 'online', service: 'Lumi API', timestamp: new Date().toISOString() });
  });

  app.use('/verify', verificationRoutes);
  app.use('/lookup', lookupRoutes);

  app.post("/unlink/complete",
    webhookRateLimiter,
    async (req, res) => {
  logger.info("Unlink webhook received");
  logger.info("Webhook headers", { headers: req.headers });
  logger.info("Webhook payload", { body: req.body });
  
  const secret = req.headers["x-verify-secret"];
  logger.info("Webhook authentication", { 
    secretReceived: !!secret, 
    secretExpected: !!process.env.VERIFY_WEBHOOK_SECRET,
    secretMatch: secret === process.env.VERIFY_WEBHOOK_SECRET 
  });
  
  if (!secret || secret !== process.env.VERIFY_WEBHOOK_SECRET) {
    logger.warn("Unlink webhook authentication failed", { ip: req.ip });
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { discordId } = req.body;

  if (!discordId) {
    logger.error("Missing discordId");
    return res.status(400).json({ error: "Missing discordId" });
  }

  const discordIdRegex = /^\d{17,19}$/;
  if (!discordIdRegex.test(discordId)) {
    logger.error("Invalid Discord ID format");
    return res.status(400).json({ error: "Invalid Discord ID format" });
  }

  try {
    logger.info("Starting unlink process", { discordId });

    const existing = await VerifiedUser.findOne({ discordId });
    
    if (!existing) {
      logger.warn("No verification record found to unlink", { discordId });
      return res.json({ 
        status: "ok", 
        message: "No verification record found",
        unlinked: false 
      });
    }

    await VerifiedUser.deleteOne({ discordId });
    
    logger.info("User unlink persisted", {
      discordId,
      robloxId: existing.robloxId,
      username: existing.username
    });

    logger.info("Emitting userUnlinked event", { discordId });
    
    try {
      req.eventBus.emit("userUnlinked", { discordId });
    } catch (emitErr) {
      logger.error('Unlink event emission failed', { error: emitErr.message, stack: emitErr.stack });
    }

    logger.info("Unlink event emitted successfully");

    const response = { 
      status: "ok", 
      message: "User unlinked successfully",
      unlinked: true,
      removedVerification: {
        discordId: existing.discordId,
        robloxId: existing.robloxId,
        username: existing.username
      }
    };
    
    logger.info("Sending unlink success response", response);
    return res.json(response);

  } catch (err) {
    logger.error("Unlink processing failed", { error: err.message, stack: err.stack });
    return res.status(500).json({ error: "Unlink failed" });
  }
});

  app.use((err, req, res, next) => {
    logger.error('Unhandled error', { error: err.message });
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};
