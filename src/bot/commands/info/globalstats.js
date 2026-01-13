
const {
  SlashCommandBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');
const VerifiedUser = require('../../../models/verifiedUser');
const e = require('../../../../storage/emojis');
const baseLogger = require('../../../utils/logger');
const log = baseLogger.child({ scope: 'globalstats' });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('globalstats')
    .setDescription('View global verification statistics across all servers'),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (err) { log.warn('Defer failed', { error: err.message }); }

    try {
      const totalVerified = await VerifiedUser.countDocuments();
      const recentVerifications = await VerifiedUser.countDocuments({
        linkedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      });

      const container = new ContainerBuilder();
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${e.lumi} Global Verification Stats`)
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${e.users} Total Verified Users: ${totalVerified.toLocaleString()}\n` +
          `${e.servers} Total Servers: ${interaction.client.guilds.cache.size.toLocaleString()}`
        )
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${e.development} Stats are updated in real-time across all Lumi servers.`)
      );

      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    } catch (err) {
      const container = new ContainerBuilder();
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${e.denied} Error\nFailed to fetch statistics.`)
      );

      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    }
  }
};
