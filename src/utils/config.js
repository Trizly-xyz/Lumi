require('dotenv').config();

const required = [
  'TOKEN',
  'CLIENT_ID',
  'VERIFIED_ROLE',
  'MONGO_URI',
  'ROBLOX_CLIENT_ID',
  'ROBLOX_CLIENT_SECRET',
  'ROBLOX_REDIRECT_URI'
];

function validateEnv(logger) {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    (logger ? logger.error : console.error)(`Env validation failed: Missing: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (!process.env.DOMAIN) {
    (logger ? logger.warn : console.warn)('DOMAIN not set; defaulting to https://trizly.xyz');
  }
}

module.exports = { validateEnv };
