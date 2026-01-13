
const {
  SlashCommandBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ButtonBuilder,
} = require("discord.js");
const e = require('../../../../storage/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Begin Discord + Roblox verification"),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (err) { console.error('[verify] Defer failed:', err.message); }

    const discordId = interaction.user.id;
    const guildId = interaction.guildId;

    const domain = process.env.DOMAIN || 'https://trizly.xyz';
    const verifyUrl = `${domain}/verify?d_id=${discordId}&g_id=${guildId}`;

    const container = new ContainerBuilder();
    const section = new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${e.arrowRight} Click the button below to link your Roblox account!`
      )
    );

    section.setButtonAccessory(
      new ButtonBuilder()
        .setLabel("Start Verification")
        .setStyle(ButtonStyle.Link)
        .setURL(verifyUrl)
    );

    container.addSectionComponents(section);

    await interaction.editReply({
      components: [container],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};
