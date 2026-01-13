const mongoose = require("mongoose");

const verificationSessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  discordId: { type: String, required: true },
  guildId: { type: String, required: false },
  state: { type: String, required: false },
  createdAt: { type: Date, default: Date.now, expires: 600 } // expires in 10 mins
});

module.exports = mongoose.model("VerificationSession", verificationSessionSchema);
