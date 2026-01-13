
const { MessageFlags, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const GuildConfig = require('../../../models/guildConfig');
const { buildPanelPage } = require('../../commands/admin/config');
const e = require('../../../../storage/emojis');
const baseLogger = require('../../../utils/logger');
const log = baseLogger.child({ scope: 'config-modals' });

async function ensureGuildConfig(guildId) {
  const cfg = await GuildConfig.findOne({ guildId });
  return cfg || await GuildConfig.create({ guildId });
}

async function buildConfigComponents(cfg, messageId, guild, page = 0) {
  const [pageContainer, navRow] = await buildPanelPage(cfg, messageId, guild, page);
  return [pageContainer.toJSON(), navRow];
}

module.exports.handle = async function(interaction) {
  const [_, setting, msgId] = interaction.customId.split(':');
  let cfg; try { cfg = await ensureGuildConfig(interaction.guildId); } catch(e){ return interaction.reply({content:`${e.denied} Config load failed.`, flags: MessageFlags.Ephemeral}).catch(()=>{});}  

  if (setting === 'send_verification_post') {
    let content = '';
    try { content = interaction.fields.getTextInputValue('content').trim(); } catch(e){ return interaction.reply({content:`${e.denied} Modal field error.`, flags: MessageFlags.Ephemeral}).catch(()=>{});}        
    if (!cfg.verificationChannelEnabled || !cfg.verificationChannelId) {
      return interaction.reply({ content: `${e.open} Set and enable a verification channel first.`, flags: MessageFlags.Ephemeral });
    }
    const domain = (process.env.DOMAIN || 'https://trizly.xyz').replace(/\/$/, '');
    const verifyUrl = `${domain}/verify`;
    try {
      const channel = await interaction.guild.channels.fetch(cfg.verificationChannelId);
      const permissions = channel.permissionsFor(interaction.guild.members.me);
      if (!permissions.has(['SendMessages', 'ViewChannel'])) {
        return interaction.reply({ content: `${e.denied} I don't have permission to send messages in that channel. Please check my permissions.`, flags: MessageFlags.Ephemeral });
      }
      await channel.send({
        components: [
          new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name}`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content || 'Click below to verify your Roblox account!'))
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e.arrowRight} Verify Here!`))
                .setButtonAccessory(new ButtonBuilder().setLabel('Verify Now').setStyle(ButtonStyle.Primary).setCustomId('universal_verify_button'))
            )
            .toJSON()
        ],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (e) {
      log.error('Send verification post failed', { error: e.message });
      return interaction.reply({ content: `${e.denied} Failed to send verification post: ${e.message}`, flags: MessageFlags.Ephemeral });
    }

    try {
      const msg = await interaction.channel.messages.fetch(msgId);
      await msg.edit({ components: await buildConfigComponents(cfg, msgId, interaction.guild), flags: MessageFlags.IsComponentsV2 });
    } catch (e) {
      log.error('Failed to update config message', { error: e.message });
      return interaction.reply({ content: `${e.denied} Failed to update config message.`, flags: MessageFlags.Ephemeral }).catch(()=>{});
    }

    return interaction.reply({ content: `${e.success} Verification post sent successfully!`, flags: MessageFlags.Ephemeral });
  }

  let value = '';
  try { value = interaction.fields.getTextInputValue('value').trim(); } catch(e){ return interaction.reply({content:`${e.denied} Modal field error.`, flags: MessageFlags.Ephemeral}).catch(()=>{});}        
  if (setting === 'set_welcome') cfg.welcomeMessage = value;
  if (setting === 'set_age') cfg.requireAccountAge = value ? parseInt(value) : null;
  await cfg.save();

  try {
    const msg = await interaction.channel.messages.fetch(msgId);
    await msg.edit({ components: await buildConfigComponents(cfg, msgId, interaction.guild), flags: MessageFlags.IsComponentsV2 });
  } catch (e) { log.error('Failed to update message after config change', { error: e.message }); }

  return interaction.reply({ content: `${e.success} Updated successfully.`, flags: MessageFlags.Ephemeral });
};
