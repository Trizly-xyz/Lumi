const axios = require("axios");
const crypto = require("crypto");
const VerificationSession = require("../../models/verificationSession");

exports.handleOAuth = async (req, res) => {
  const { code, state } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Missing OAuth code" });
  }

  try {

    const tokenResp = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://trizly.xyz/verify/callback"
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const accessToken = tokenResp.data.access_token;

    const userResp = await axios.get("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const discordUser = userResp.data;

    let guildId = null;
    let userId = discordUser.id;

    if (state && state.includes(":")) {
      const [g, u] = state.split(":");
      guildId = g || null;
      userId = u || discordUser.id;
    }

    const token = crypto.randomBytes(20).toString("hex");

    await VerificationSession.create({
      token,
      discordId: discordUser.id,
      guildId,
      state
    });

    return res.json({
      success: true,
      token,
      discordId: discordUser.id,
      guildId
    });

  } catch (err) {
    console.error("OAuth Error:", err.response?.data || err);

    return res.status(500).json({
      error: "OAuth verification failed"
    });
  }
};
