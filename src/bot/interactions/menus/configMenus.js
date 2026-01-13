
const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const GuildConfig = require('../../../models/guildConfig');
const e = require('../../../../storage/emojis');
const baseLogger = require('../../../utils/logger');
const log = baseLogger.child({ scope: 'config-menus' });

async function ensureGuildConfig(guildId) {
  const cfg = await GuildConfig.findOne({ guildId });
  return cfg || await GuildConfig.create({ guildId });
}

module.exports.handle = async function(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: `${e.locked} Manage Server permission required.`, flags: MessageFlags.Ephemeral });
  }

  const [_, action] = interaction.customId.split(':');
  let cfg; try { cfg = await ensureGuildConfig(interaction.guildId); } catch(e){ return interaction.reply({content:'Config load failed.', flags: MessageFlags.Ephemeral}).catch(()=>{});}  

  if (interaction.isStringSelectMenu()) {
    if (action === 'name_format_select') {
      const selected = interaction.values[0];
      cfg.nameSyncFormat = selected;
      await cfg.save();
      return interaction.reply({ content: `${e.configuration} Name format changed to ${selected}.`, flags: MessageFlags.Ephemeral });
    }
  }

  if (interaction.isRoleSelectMenu()) {
    const selectedRoleId = interaction.values[0];
    if (action === 'role_select') {
      cfg.verifiedRoleId = selectedRoleId;
      await cfg.save();
      let content = `${e.userSecure} Verified role set to <@&${selectedRoleId}>.`;
      try {
        const role = await interaction.guild.roles.fetch(selectedRoleId);
        const botMember = interaction.guild.members.me;
        const hasPerm = botMember.permissions.has(PermissionFlagsBits.ManageRoles);
        const aboveRole = botMember.roles.highest && role ? botMember.roles.highest.comparePositionTo(role) > 0 : false;
        if (!hasPerm || !aboveRole) {
          const topName = botMember.roles.highest?.name || 'unknown';
          content += `\n${e.denied} I cannot assign this role currently. Ensure I have Manage Roles and my highest role (currently "${topName}") is above the selected role.`;
        }
      } catch (e) { log.error('Failed to fetch role for permission check', { error: e.message }); }
      return interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
    if (action === 'unverified_role_select') {
      cfg.unverifiedRoleId = selectedRoleId;
      await cfg.save();
      let content = `${e.userRemove} Unverified role set to <@&${selectedRoleId}>.`;
      try {
        const role = await interaction.guild.roles.fetch(selectedRoleId);
        const botMember = interaction.guild.members.me;
        const hasPerm = botMember.permissions.has(PermissionFlagsBits.ManageRoles);
        const aboveRole = botMember.roles.highest && role ? botMember.roles.highest.comparePositionTo(role) > 0 : false;
        if (!hasPerm || !aboveRole) {
          const topName = botMember.roles.highest?.name || 'unknown';
          content += `\n${e.denied} I cannot manage this role currently. Ensure I have Manage Roles and my highest role (currently "${topName}") is above the selected role.`;
        }
      } catch (e) { log.error('Failed to fetch unverified role for permission check', { error: e.message }); }
      return interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }

  if (interaction.isChannelSelectMenu()) {
    if (action === 'channel_select') {
      const selectedChannelId = interaction.values[0];
      cfg.verificationChannelId = selectedChannelId;
      await cfg.save();
      return interaction.reply({ content: `${e.open} Verification channel set to <#${selectedChannelId}>.`, flags: MessageFlags.Ephemeral });
    }
  }
};
