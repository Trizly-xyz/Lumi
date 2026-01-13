
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');
const GuildConfig = require('../../../models/guildConfig');
const VerifiedUser = require('../../../models/verifiedUser');
const { buildPanelPage } = require('../../commands/admin/config');
const e = require('../../../../storage/emojis');
const eventBus = require('../../../utils/eventBus');
const baseLogger = require('../../../utils/logger');
const log = baseLogger.child({ scope: 'verify-button' });

async function ensureGuildConfig(guildId) {
  const cfg = await GuildConfig.findOne({ guildId });
  return cfg || await GuildConfig.create({ guildId });
}

module.exports.handle = async function(interaction, client) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  let cfg = null;
  try { cfg = await ensureGuildConfig(guildId); } catch (err) { log.error('cfg load failed', { error: err.message }); }

  try {
    const existing = await VerifiedUser.findOne({ discordId: userId }).lean();
    if (existing) {
      const addedRoles = [];
      const removedRoles = [];
      const notes = [];
      try {
        const cfg = await ensureGuildConfig(guildId);
        const verifiedRoleId = cfg?.verifiedRoleId || process.env.VERIFIED_ROLE;
        const unverifiedRoleId = cfg?.useUnverifiedRole ? cfg?.unverifiedRoleId : null;

        if (!verifiedRoleId) {
          return interaction.reply({
            content: `${e.userSuccess} You are already verified, but no verified role is configured. Please ask an admin to set one.`,
            flags: MessageFlags.Ephemeral
          });
        }

        const guild = interaction.guild;
        const member = await guild.members.fetch(userId);
        const verifiedRole = await guild.roles.fetch(verifiedRoleId);
        const unverifiedRole = unverifiedRoleId ? await guild.roles.fetch(unverifiedRoleId).catch(() => null) : null;
        if (!verifiedRole) {
          return interaction.reply({ content: `${e.userDenied} Verified role was not found in this server.`, flags: MessageFlags.Ephemeral });
        }

        try {
          await member.roles.add(verifiedRoleId, 'Adding verified role');
          addedRoles.push(`<@&${verifiedRoleId}>`);
        } catch (err) {
          const botMember = guild.members.me;
          const botTop = botMember?.roles.highest;
          if (err?.code === 50013) {
            const reason = 'I do not have permission or my highest role is below the verified role. Please move my highest role above the verified role and grant Manage Roles.';
            notes.push(reason);
          }
          log.error('role add failed', { error: err?.message, code: err?.code, botTop: botTop?.name, botTopPos: botTop?.position, verifiedPos: verifiedRole.position });
        }

        if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
          try {
            await member.roles.remove(unverifiedRole, 'Removing Unverified role');
            removedRoles.push(`<@&${unverifiedRole.id}>`);
          } catch (err) {
            log.error('unverified role remove failed', { error: err?.message, code: err?.code });
          }
        }

        const container = new ContainerBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${e.user} Member Updated\n${interaction.user.tag}`))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Added Roles**\n${addedRoles.length ? addedRoles.join(', ') : 'None'}`))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Removed Roles**\n${removedRoles.length ? removedRoles.join(', ') : 'None'}`));

        if (notes.length) {
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Notes**\n${notes.join('\n')}`));
        }

        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      } catch (roleErr) {
        log.error('immediate role application failed', { error: roleErr.message });

      }

      const payload = {
        discordId: userId,
        guildId,
        robloxId: existing.robloxId,
        username: existing.username || 'unknown'
      };

      try { eventBus.emit('userVerified', payload); } catch (emitErr) { log.error('emit failed', { error: emitErr.message }); }

      return interaction.reply({
        content: `${e.userSuccess} You are already verified. Applying your roles now.`,
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (lookupErr) {
    log.error('lookup failed', { error: lookupErr.message });
  }

  const domain = process.env.DOMAIN || 'https://trizly.xyz';
  const base = domain.replace(/\/$/, '');
  const verifyUrl = `${base}/verify?d_id=${userId}&g_id=${guildId}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Start Verification').setStyle(ButtonStyle.Link).setURL(verifyUrl)
  );

  return interaction.reply({
    content: `${e.arrowRight} Click the button to start verification.`,
    components: [row],
    flags: MessageFlags.Ephemeral
  });
};
