const { 
  SlashCommandBuilder, 
  ButtonStyle, 
  MessageFlags,
  ContainerBuilder, 
  SectionBuilder, 
  TextDisplayBuilder, 
  ButtonBuilder 
} = require('discord.js');
const e = require('../../../../storage/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Roblox account'),
  async execute(interaction) {
    try { await interaction.deferReply(); } catch (_) {}

    const discordId = interaction.user.id;
    const guildId = interaction.guildId || process.env.GUILD_ID;
    const domain = process.env.DOMAIN || 'https://trizly.xyz';
    const base = domain.replace(/\/$/, '');
    const pagesUrl = `${base}/verify?d_id=${discordId}&g_id=${guildId}`;

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${e.userSecure} Link your Roblox account`))
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e.arrowRight} Connect your Roblox account to continue.`))
          .setButtonAccessory(new ButtonBuilder().setLabel('Link').setStyle(ButtonStyle.Link).setURL(pagesUrl))
      );
    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  }
};
