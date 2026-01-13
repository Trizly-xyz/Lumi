const mongoose = require('mongoose');

const verifiedUserSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  robloxId: { type: String, required: true },
  username: { type: String },
  verifiedAt: { type: Date, default: Date.now },
  discordAccessToken: { type: String },
  discordRefreshToken: { type: String },
  discordTokenExpiry: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('VerifiedUser', verifiedUserSchema);
