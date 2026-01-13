
const logger = require("../../utils/logger");
const GuildConfig = require("../../models/guildConfig");
const { applyNameSync } = require("../../utils/nameSync");
const { safeSendDM } = require("../../utils/dmUtils");
const e = require('../../../storage/emojis');
const { 
  PermissionFlagsBits, 
  ContainerBuilder, 
  SectionBuilder, 
  TextDisplayBuilder,
  MessageFlags 
} = require("discord.js");

module.exports = function registerVerificationHandler(eventBus, client, loggerOverride) {
  const log = loggerOverride || logger;
  log.info("Verification handler initialized.");

  eventBus.on("userVerified", async (data) => {
    const { discordId, guildId, robloxId, username } = data;

    try {

      const config = await GuildConfig.findOne({ guildId }).lean();

      const VERIFIED_ROLE_ID = config?.verifiedRoleId || process.env.VERIFIED_ROLE;
      const UNVERIFIED_ROLE_ID = config?.unverifiedRoleId || null;
      const USE_UNVERIFIED = config?.useUnverifiedRole || false;
      const VERIFIED_ROLE_ENABLED = config?.verifiedRoleEnabled !== false; // default true

      if (!VERIFIED_ROLE_ENABLED) {
        return;
      }

      if (!VERIFIED_ROLE_ID) {
        logger.error("Verified role is not configured for this guild.", { guildId });
        return;
      }

      const guild = client.guilds.cache.get(guildId);

      if (!guild) {
        logger.error(`Bot is not present in the target guild.`, { guildId });
        return;
      }

      await guild.roles.fetch().catch(() => {});

      const member = await guild.members
        .fetch(discordId)
        .catch((err) => {
          logger.error(`Failed to fetch guild member`, { discordId, error: err.message });
          return null;
        });

      if (!member) {
        return;
      }

      const verifiedRole = guild.roles.cache.get(VERIFIED_ROLE_ID);
      if (!verifiedRole) {
        logger.error(`Verified role does not exist in this guild.`, { guildId, roleId: VERIFIED_ROLE_ID });
        return;
      }

      const botMember = guild.members.me;
      if (!botMember) {
        logger.error("Unable to resolve bot guild member.", { guildId });
        return;
      }

      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        logger.error("Bot lacks the Manage Roles permission.", { guildId });
        return;
      }

      const getHighestRole = (m) => {
        let top = null;
        for (const roleId of m.roles.cache.keys()) {
          const role = guild.roles.cache.get(roleId);
          if (!role) continue;
          if (!top || role.position > top.position) top = role;
        }
        return top;
      };

      const botTopRole = getHighestRole(botMember);

      if (!botTopRole) {
        logger.error("Bot has no roles available to evaluate hierarchy.", { guildId });
        return;
      }

      if (botTopRole.position <= verifiedRole.position) {
        logger.error("Bot's highest role is below the verified role; assignment is not permitted.", { guildId, botRole: botTopRole.name, verifiedRole: verifiedRole.name });
        return;
      }

      let roleAssigned = false;
      try {
        await member.roles.add(verifiedRole, 'Adding verified role');
        roleAssigned = true;
      } catch (err) {
        const isPerm = err?.code === 50013;
        logger.error("Failed to assign verified role.", {
          guildId,
          member: member.user.tag,
          error: err.message,
          code: err.code,
          reason: isPerm ? 'Missing Permissions / role hierarchy' : 'Unknown'
        });
        throw err;
      }

      let nameSyncResult = null;
      if (config?.nameSyncEnabled) {
        const format = config.nameSyncFormat || 'username';
        try {
          nameSyncResult = await applyNameSync({
            guild,
            member,
            format,
            robloxId,
            username,
            logger
          });
          if (!nameSyncResult.applied) {
            logger.warn(`Name sync skipped or rejected (${nameSyncResult.reason || 'unknown'})`, { 
              guildId, 
              member: member.user.tag, 
              error: nameSyncResult.error 
            });
          }
        } catch (syncErr) {
          logger.error(`Name sync failed with an error`, { 
            guildId, 
            member: member.user.tag, 
            error: syncErr.message, 
            stack: syncErr.stack 
          });
        }
      }

      if (USE_UNVERIFIED && UNVERIFIED_ROLE_ID) {
        const unverifiedRole = guild.roles.cache.get(UNVERIFIED_ROLE_ID);
        if (unverifiedRole && member.roles.cache.has(UNVERIFIED_ROLE_ID)) {
          await member.roles.remove(unverifiedRole, 'Removing Unverified role').catch((err) => {
            logger.warn('Unable to remove unverified role', { guildId, member: member.user.tag, error: err.message });
          });
        }
      }

      if (roleAssigned) {
        try {

          const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${e.success} Verification Complete`))
            .addSectionComponents(
              new SectionBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  `${e.userSuccess} Your verification in **${guild.name}** is complete.\n\n` +
                  `${e.robot} Roblox Account: ${username}\n` +
                  `${e.identificationCard} Roblox ID: ${robloxId}`
                )
              )
            );

          if (nameSyncResult && !nameSyncResult.applied && nameSyncResult.reason === 'set_failed') {
            container.addSectionComponents(
              new SectionBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  `${e.denied} Note: Your nickname could not be updated due to insufficient permissions.`
                )
              )
            );
          }

          const dmResult = await safeSendDM(
            member,
            {
              components: [container],
              flags: MessageFlags.IsComponentsV2
            },
            {
              fallbackChannelId: config?.dmFailureFallbackChannel,
              fallbackMessage: `${member} — ${e.success} Your verification in **${guild.name}** is complete. ${e.denied} A direct message could not be delivered. Please review your privacy settings to allow DMs from this server.`
            },
            'verification'
          );

          if (dmResult.success) {
            logger.info('Verification notification delivered', { 
              discordId, 
              guildId, 
              username,
              method: dmResult.dmSent ? 'DM' : 'fallback'
            });
          } else {
            logger.warn('Unable to deliver verification notification', { 
              discordId, 
              guildId, 
              error: dmResult.error
            });
          }
        } catch (dmErr) {
          logger.error('Unexpected error while sending verification notification', { 
            discordId, 
            guildId, 
            error: dmErr.message,
            stack: dmErr.stack
          });
        }
      }

    } catch (err) {
      logger.error("Verification handler encountered a fatal error", { error: err.message, stack: err.stack });
    }
  });
};
