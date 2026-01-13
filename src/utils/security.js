

const crypto = require('crypto');
const logger = require('./logger');

function verifyHmac(rawBody, signature, secretList) {
  if (!secretList) return true; // feature disabled
  if (!signature) return false;
  const secrets = secretList.split(',').map(s => s.trim()).filter(Boolean);
  for (const secret of secrets) {
    const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest();
    let provided;
    try {
      if (/^[0-9a-fA-F]+$/.test(signature)) {
        provided = Buffer.from(signature, 'hex');
      } else {
        provided = Buffer.from(signature, 'base64');
      }
    } catch (_) {
      return false;
    }
    if (provided.length === hmac.length && crypto.timingSafeEqual(provided, hmac)) {
      return true; // matched one secret
    }
  }
  return false;
}

function rawBodyCapture(req, res, next) {
  let data = [];
  req.on('data', chunk => data.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(data).toString('utf8');
    next();
  });
}

function signatureCheck(req, res, next) {
  const secret = process.env.CALLBACK_HMAC_SECRET;

  if (!secret || secret.startsWith('CHANGE_ME') || !req.rawBody) return next();
  const sig = req.headers['x-verification-sig'];
  if (!verifyHmac(req.rawBody || '', sig, secret)) {
    logger.warn('HMAC verification failed', { ip: req.ip, haveSig: !!sig });
    return res.status(401).json({ error: 'Invalid signature' });
  }
  next();
}

module.exports = { rawBodyCapture, signatureCheck };
