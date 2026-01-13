
const {
  SlashCommandBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');
const e = require('../../../../storage/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency and response time'),

  async execute(interaction) {
    const sent = Date.now();
    
    let deferred = false;
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      deferred = true;
    } catch (err) { console.error('[ping] Defer failed:', err.message); }

    const latency = Date.now() - sent;
    const apiLatency = Math.round(interaction.client.ws.ping);

    const container = new ContainerBuilder();
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${e.ping} Pong`)
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${e.time1} Bot Latency: ${latency}ms\n${e.time2} API Latency: ${apiLatency}ms`)
    );

    if (deferred) {
      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    } else {
      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    }
  }
};
