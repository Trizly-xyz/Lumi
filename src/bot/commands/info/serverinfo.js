
const {
  SlashCommandBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  MessageFlags,
  EmbedBuilder
} = require('discord.js');
const VerifiedUser = require('../../../models/verifiedUser');
const GuildConfig = require('../../../models/guildConfig');
const e = require('../../../../storage/emojis');
const baseLogger = require('../../../utils/logger');
const log = baseLogger.child({ scope: 'serverinfo' });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('View detailed server information and verification statistics'),

  async execute(interaction) {
    try { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); } catch (err) { log.warn('Defer failed', { error: err.message }); }

    if (!interaction.guildId) {
      const c = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('This command can only be used inside a server.'));
      return interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    try {
      const guild = interaction.guild || await interaction.client.guilds.fetch(interaction.guildId);
      const cfg = await GuildConfig.findOne({ guildId: interaction.guildId }).catch(() => null);

      await guild.members.fetch().catch(() => null);
      const allMembers = guild.members.cache;
      const totalMembers = allMembers.size;
      const botCount = allMembers.filter(m => m.user.bot).size;
      const humanCount = totalMembers - botCount;

      const verifiedRoleId = cfg?.verifiedRoleId;
      let verifiedCount = 0;
      if (verifiedRoleId) {
        verifiedCount = allMembers.filter(m => m.roles.cache.has(verifiedRoleId)).size;
      }

      const totalVerifiedGlobal = await VerifiedUser.countDocuments().catch(() => 0);

      const verificationPercent = humanCount > 0 ? Math.round((verifiedCount / humanCount) * 100) : 0;

      const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);

      const serverLines = [
        `${e.servers} Server Information`,
        `Name: **${guild.name}**`,
        `ID: \`${guild.id}\``,
        `Owner: <@${guild.ownerId}>`,
        `Created: <t:${createdTimestamp}:f> (<t:${createdTimestamp}:R>)`,
        `Boost Tier: Level ${guild.premiumTier}`,
        `Boosts: ${guild.premiumSubscriptionCount || 0}`,
        ``,
        `${e.users} Member Statistics`,
        `Total Members: ${totalMembers.toLocaleString()}`,
        `Humans: ${humanCount.toLocaleString()}`,
        `Bots: ${botCount.toLocaleString()}`,
        ``,
        `${e.secure} Verification Stats`,
        `Verified Members: ${verifiedCount.toLocaleString()} (${verificationPercent}% of humans)`,
        `Global Verified Users: ${totalVerifiedGlobal.toLocaleString()}`,
        ``,
        `${e.configuration} Configuration Status`,
        `Verified Role: ${cfg?.verifiedRoleId ? `<@&${cfg.verifiedRoleId}> (${verifiedCount} members)` : `${e.denied} Not set`}`,
        `Unverified Role: ${cfg?.unverifiedRoleId ? `<@&${cfg.unverifiedRoleId}>` : `${e.denied} Not set`}`,
        `Verification Channel: ${cfg?.verificationChannelId ? `<#${cfg.verificationChannelId}>` : `${e.denied} Not set`}`,
        `Auto-Verify on Join: ${cfg?.autoVerifyOnJoin ? `${e.success} Enabled` : `${e.denied} Disabled`}`,
        `Name Sync: ${cfg?.nameSyncEnabled ? `${e.success} Enabled (${cfg.nameSyncFormat || 'username'})` : `${e.denied} Disabled`}`,
      ];

      const container = new ContainerBuilder();

      // Build an embed with server thumbnail/icon on the side
      const iconUrl = guild.iconURL({ size: 256, dynamic: true });
      const embed = new EmbedBuilder()
        .setTitle(guild.name)
        .setColor(0x2b2d31)
        .setDescription(serverLines.join('\n'));
      if (iconUrl) embed.setThumbnail(iconUrl);

      return interaction.editReply({ embeds: [embed], components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
      log.error('Command failed', { error: err.message });
      const c = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e.denied} Failed to fetch server information: ${err.message}`));
      return interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }
  }
};
