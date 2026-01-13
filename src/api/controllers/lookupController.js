const VerifiedUser = require('../../models/verifiedUser');
const { getRobloxUserById, resolveRobloxUsername, getRobloxAvatarHeadshot } = require('../../utils/http');
const logger = require('../../utils/logger');

function isSnowflake(id) {
  return /^\d{17,19}$/.test(String(id || ''));
}

function isNumericId(id) {
  return /^\d{1,20}$/.test(String(id || ''));
}

function snowflakeToTimestampMs(id) {
  try {
    const base = 1420070400000n; // Discord epoch (ms)
    const ts = (BigInt(id) >> 22n) + base;
    return Number(ts);
  } catch (_) {
    return null;
  }
}

async function buildRobloxInfo(userId) {
  try {
    const profileResp = await getRobloxUserById(String(userId));
    const profile = profileResp?.data || {};
    const avatarResp = await getRobloxAvatarHeadshot(String(userId), '420x420');
    const thumb = avatarResp?.data?.data?.[0];
    const avatarUrl = thumb?.imageUrl || null;
    const createdAt = profile?.created ? new Date(profile.created).toISOString() : null;

    return {
      id: String(userId),
      name: profile?.name || null,
      displayName: profile?.displayName || profile?.name || null,
      description: profile?.description != null ? String(profile.description) : null,
      createdAt,
      avatarUrl,
      profileUrl: `https://www.roblox.com/users/${String(userId)}/profile`
    };
  } catch (err) {
    logger.warn('Roblox info fetch failed', { userId, error: err.message });
    return null;
  }
}

function buildDiscordInfoFromId(discordId) {
  const createdMs = snowflakeToTimestampMs(discordId);
  return {
    id: String(discordId),
    createdAt: createdMs ? new Date(createdMs).toISOString() : null,
    username: null,
    displayName: null,
    avatarUrl: null
  };
}

async function lookupDiscord(req, res) {
  const discordId = req.params.discordId;
  if (!isSnowflake(discordId)) {
    return res.status(400).json({ error: 'Invalid Discord ID format' });
  }

  const discord = buildDiscordInfoFromId(discordId);

  let linked = null;
  try {
    linked = await VerifiedUser.findOne({ discordId });
  } catch (err) {
    logger.error('DB lookup failed', { error: err.message });
  }

  let roblox = null;
  if (linked?.robloxId) {
    roblox = await buildRobloxInfo(linked.robloxId);
  }

  return res.json({
    discord,
    roblox,
    linked: !!linked,
    source: 'discord'
  });
}

async function lookupRoblox(req, res) {
  const identifier = String(req.params.identifier || '').trim();
  if (!identifier) return res.status(400).json({ error: 'Missing identifier' });

  let robloxId = null;

  if (isSnowflake(identifier)) {

    try {
      const record = await VerifiedUser.findOne({ discordId: identifier });
      if (record?.robloxId) robloxId = String(record.robloxId);
    } catch (err) {
      logger.error('DB lookup failed', { error: err.message });
    }
    if (!robloxId) {
      return res.status(404).json({ error: 'No linked Roblox account for that Discord ID' });
    }
  } else if (isNumericId(identifier)) {

    robloxId = String(identifier);
  } else {

    try {
      const resolved = await resolveRobloxUsername(identifier);
      const data = resolved?.data?.data?.[0];
      if (data?.id) robloxId = String(data.id);
    } catch (err) {
      logger.warn('Roblox username resolve failed', { identifier, error: err.message });
    }
    if (!robloxId) {
      return res.status(404).json({ error: 'No Roblox user found for that username' });
    }
  }

  const roblox = await buildRobloxInfo(robloxId);
  if (!roblox) return res.status(502).json({ error: 'Failed to fetch Roblox profile' });

  let discord = null; let linked = null;
  try {
    linked = await VerifiedUser.findOne({ robloxId: String(robloxId) });
  } catch (err) {
    logger.error('DB lookup failed', { error: err.message });
  }
  if (linked?.discordId) {
    discord = buildDiscordInfoFromId(linked.discordId);
  }

  return res.json({
    roblox,
    discord,
    linked: !!linked,
    source: 'roblox'
  });
}

module.exports = { lookupDiscord, lookupRoblox };
