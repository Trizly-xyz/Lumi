
const {
  SlashCommandBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');
const VerifiedUser = require('../../../models/verifiedUser');
const GuildConfig = require('../../../models/guildConfig');
const { applyNameSync } = require('../../../utils/nameSync');
const e = require('../../../../storage/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('update')
    .setDescription('If already linked, apply verified role and nickname in this server'),

  async execute(interaction) {
    try { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); } catch (_) {}

    if (!interaction.guildId) {
      const c = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${e.configuration} Update`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e.denied} Run this command inside a server.`));
      return interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    const guild = interaction.guild || await interaction.client.guilds.fetch(interaction.guildId);
    const member = interaction.member || await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      const c = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${e.configuration} Update`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e.denied} I could not find you in this server.`));
      return interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    const cfg = await GuildConfig.findOne({ guildId: interaction.guildId }).catch(() => null);
    const roleId = (cfg && cfg.verifiedRoleId) || process.env.VERIFIED_ROLE;
    const roleEnabled = cfg?.verifiedRoleEnabled !== false; // default true
    const unverifiedRoleId = cfg?.useUnverifiedRole ? cfg?.unverifiedRoleId : null;

    if (!roleEnabled) {
      const c = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${e.configuration} Update`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e.denied} Verified role is disabled for this server.`));
      return interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    if (!roleId) {
      const c = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${e.configuration} Update`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e.denied} No verified role configured for this server.`));
      return interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    const record = await VerifiedUser.findOne({ discordId: interaction.user.id }).catch(() => null);
    if (!record) {
      const c = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Update'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('You have not linked a Roblox account yet. Use /verify or /link.'));
      return interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    const summaryLines = [];

    if (member.roles.cache.has(roleId)) {
      summaryLines.push(`${e.userSuccess} Verified role already applied.`);
    } else {
      try {
        await member.roles.add(roleId);
        summaryLines.push(`${e.userSuccess} Verified role added successfully.`);
      } catch (err) {
        summaryLines.push(`${e.denied} Could not add the verified role. Check my permissions and role hierarchy.`);
      }
    }

    if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
      try {
        await member.roles.remove(unverifiedRoleId, 'Lumi update command cleanup');
        summaryLines.push(`${e.userRemove} Removed unverified role.`);
      } catch (err) {
        summaryLines.push(`${e.denied} Could not remove unverified role.`);
      }
    }

    if (cfg?.nameSyncEnabled) {
      const nameResult = await applyNameSync({
        guild,
        member,
        format: cfg.nameSyncFormat || 'username',
        robloxId: record.robloxId,
        username: record.username
      });
      if (nameResult.applied) {
        summaryLines.push(`${e.development} Nickname updated to "${nameResult.nickname}".`);
      } else {
        summaryLines.push(`${e.open} Nickname update skipped (${nameResult.reason || 'unknown'}).`);
      }
    }

    const c = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${e.success} Update Complete`))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `Roblox: ${record.username} (${record.robloxId})\n` + summaryLines.join('\n')
      ));
    return interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  }
};
