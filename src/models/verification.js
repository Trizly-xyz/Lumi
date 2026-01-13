
const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  discordId: { type: String, required: true },
  guildId: { type: String, required: true },
  nonce: { type: String },
  code: { type: String },
  status: { type: String, enum: ['pending', 'exchanged', 'completed', 'error'], default: 'pending' },
  error: String
}, { timestamps: true });

verificationSchema.index({ discordId: 1, guildId: 1 }, { unique: false });

module.exports = mongoose.model('Verification', verificationSchema);
