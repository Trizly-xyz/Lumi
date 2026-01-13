
const {
  SlashCommandBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
} = require('discord.js');
const e = require('../../../../storage/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View all available commands and their descriptions'),

  async execute(interaction) {
    let deferred = false;
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      deferred = true;
    } catch (err) { console.error('[help] Defer failed:', err.message); }

    const container = new ContainerBuilder();
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${e.lumi} Lumi Commands\nHere are all available commands:`)
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${e.userSecure} Verification Commands`)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('`/verify` - Start the verification process\n`/link` - Link your Roblox account\n`/unlink` - Get link to unlink your account securely\n`/update` - Apply verified role and nickname')
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${e.document} Info Commands`)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('`/getinfo` - Get Roblox account info for a user\n`/stats` - View global verification statistics.\n`/status` - Check your server\'s verification settings.\n`/help` - View this help menu')
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${e.configuration} Admin Commands`)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('`/config` - Configure bot settings for this server')
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${e.supportAgent} Need more help?\nVisit https://trizly.xyz/ for help.`)
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
