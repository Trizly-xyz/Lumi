const logger = require('../../utils/logger');
const VerifiedUser = require('../../models/verifiedUser');
const GuildConfig = require('../../models/guildConfig');
const { applyNameSync } = require('../../utils/nameSync');

module.exports = {
	name: 'guildMemberAdd',
	once: false,
	async execute(member) {
		try {
			const guildId = member.guild.id;
			const discordId = member.id;

			const cfg = await GuildConfig.findOne({ guildId }).lean();
			const useUnverified = !!(cfg && cfg.useUnverifiedRole);
			const unverifiedRoleId = cfg && cfg.unverifiedRoleId ? cfg.unverifiedRoleId : null;
			const autoVerifyOnJoin = !!(cfg && cfg.autoVerifyOnJoin);
			const verifiedRoleEnabled = cfg?.verifiedRoleEnabled !== false; // default true

			const verifiedRoleId = (cfg && cfg.verifiedRoleId) || process.env.VERIFIED_ROLE || null;

			const linked = await VerifiedUser.findOne({ discordId }).lean();

			if (!linked) {

				if (useUnverified && unverifiedRoleId) {
					try {
						if (!member.roles.cache.has(unverifiedRoleId)) {
								await member.roles.add(unverifiedRoleId, 'Adding unverified role');
							}
					} catch (e) {
						logger.warn('Failed adding unverified role on join', { guildId, discordId, error: e.message });
					}
				}
				if (verifiedRoleId && member.roles.cache.has(verifiedRoleId)) {
					try {
						await member.roles.remove(verifiedRoleId, 'Removing Verified role');
					} catch (e) {
						logger.warn('Failed removing verified role from unlinked user', { guildId, discordId, error: e.message });
					}
				}
				logger.info('Processed join for unlinked member', { guildId, discordId });
				return;
			}

			if (autoVerifyOnJoin && verifiedRoleEnabled && verifiedRoleId) {
				try {
					if (!member.roles.cache.has(verifiedRoleId)) {
						await member.roles.add(verifiedRoleId, 'Adding verified role');
					}
				} catch (e) {
					logger.warn('Failed adding verified role on join', { guildId, discordId, error: e.message });
				}

				if (useUnverified && unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
					try {
						await member.roles.remove(unverifiedRoleId, 'Removing Unverified role');
					} catch (e) {
						logger.warn('Failed removing unverified role from linked user', { guildId, discordId, error: e.message });
					}
				}

				if (cfg?.nameSyncEnabled && linked?.robloxId) {
					await applyNameSync({
						guild: member.guild,
						member,
						format: cfg.nameSyncFormat,
						robloxId: linked.robloxId,
						username: linked.username,
						logger
					});
				}
				logger.info('Processed join for linked member (auto-verified)', { guildId, discordId });
			} else {

				if (useUnverified && unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
					try {
						await member.roles.remove(unverifiedRoleId);
					} catch (e) {
						logger.warn('Failed removing unverified role (linked user, no auto-verify)', { guildId, discordId, error: e.message });
					}
				}
				logger.info('Processed join for linked member (no auto-verify)', { guildId, discordId });
			}
		} catch (err) {
			logger.error('guildMemberAdd handler error', { error: err.message });
		}
	}
};

