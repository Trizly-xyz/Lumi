
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  discordId: { type: String, required: true },
  guildId: { type: String, required: true },
  robloxId: String,
  username: String,
  verifiedAt: Date
}, { timestamps: true });

schema.index({ discordId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('User', schema);
