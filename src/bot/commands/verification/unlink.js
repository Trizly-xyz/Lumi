
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
    .setName('unlink')
    .setDescription("Unlink your Roblox verification"),

  async execute(interaction) {
    try { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); } catch (err) { console.error('[unlink] Defer failed:', err.message); }

    const domain = process.env.DOMAIN || 'https://trizly.xyz';
    const unlinkUrl = `${domain}/unlink`;

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${e.documentSecure} Unlink your Roblox account`))
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e.userSecure} For security, sign in with Discord to confirm your identity before unlinking.`))
          .setButtonAccessory(new ButtonBuilder().setLabel('Unlink Account').setStyle(ButtonStyle.Link).setURL(unlinkUrl))
      );

    await interaction.editReply({
      components: [container],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    });
  }
};
