const Verification = require('../models/verification');

async function cleanupPending(thresholdMs, logger) {
  const cutoff = Date.now() - thresholdMs;
  const res = await Verification.deleteMany({ status: 'pending', createdAt: { $lt: new Date(cutoff) } });
  if (res.deletedCount) {
    logger.info('Removed expired pending verifications', { count: res.deletedCount });
  }
}

module.exports = { cleanupPending };
