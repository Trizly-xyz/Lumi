const { getRobloxUserById } = require('./http');

function buildNickname(format, username, displayName) {
  const safeUsername = username || '';
  const safeDisplay = displayName || safeUsername;
  const fmt = format || 'username';

  if (!safeUsername && !safeDisplay) return '';

  if (fmt === 'smart') {
    const base = safeDisplay || safeUsername;
    return `${base} (@${safeUsername})`;
  }

  if (fmt === 'display') {
    return safeDisplay || safeUsername;
  }

  return safeUsername;
}

async function applyNameSync({ guild, member, format, robloxId, username, logger }) {
  const log = logger || console;
  if (!guild || !member) return { applied: false, reason: 'missing_member' };

  const botMember = guild.members.me;
  if (!botMember || !botMember.permissions.has('ManageNicknames')) {
    return { applied: false, reason: 'missing_permission' };
  }

  let displayName = '';
  try {
    const profile = await getRobloxUserById(robloxId);
    displayName = profile?.data?.displayName || profile?.data?.name || '';
  } catch (err) {
    log.warn('[namesync] Unable to fetch Roblox display name', err.message);
  }

  const nickname = buildNickname(format, username, displayName).slice(0, 32);
  if (!nickname) return { applied: false, reason: 'empty_nickname' };

  try {
    if (member.nickname === nickname) {
      return { applied: true, nickname, reason: 'unchanged' };
    }
    await member.setNickname(nickname);
    return { applied: true, nickname };
  } catch (err) {
    log.warn('[namesync] Unable to update nickname', err.message);
    return { applied: false, reason: 'set_failed', error: err.message };
  }
}

module.exports = { buildNickname, applyNameSync };
