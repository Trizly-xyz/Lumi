
const {
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const GuildConfig = require('../../../models/guildConfig');
const { buildPanelPage } = require('../../commands/admin/config');
const e = require('../../../../storage/emojis');
const baseLogger = require('../../../utils/logger');
const log = baseLogger.child({ scope: 'config-buttons' });

async function ensureGuildConfig(guildId) {
  const cfg = await GuildConfig.findOne({ guildId });
  return cfg || await GuildConfig.create({ guildId });
}

async function buildConfigComponents(cfg, messageId, guild, page = 0) {
  const [pageContainer, navRow] = await buildPanelPage(cfg, messageId, guild, page);
  return [pageContainer.toJSON(), navRow];
}

module.exports.handle = async function(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: `${e.locked} Manage Server permission required.`, flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  const [_, action, msgId] = interaction.customId.split(":");
  let cfg; try { cfg = await ensureGuildConfig(interaction.guildId); } catch(e){ log.warn('Config load failed', { error: e.message }); return interaction.reply({content:`${e.denied} Config load failed.`, flags: MessageFlags.Ephemeral}).catch(()=>{});}  

  if (action === 'page_prev' || action === 'page_next') {
    const parts = interaction.customId.split(":");
    const currentPage = parseInt(parts[3]) || 0;
    const nextPage = action === 'page_prev' ? (currentPage === 0 ? 2 : currentPage - 1) : ((currentPage + 1) % 3);
    const [pageContainer, navRow] = await buildPanelPage(cfg, msgId, interaction.guild, nextPage);
    return interaction.update({ components: [pageContainer.toJSON(), navRow], flags: MessageFlags.IsComponentsV2 });
  }

  if (action === 'select_role') {
    if (!cfg.verifiedRoleEnabled) {
      return interaction.reply({ content: `${e.userDenied} Enable verified role first.`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({
      components: [
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder().setCustomId(`cfg:role_select:${msgId}`).setPlaceholder('Select a role…')
        )
      ],
      flags: MessageFlags.Ephemeral
    });
  }

  if (action === 'select_unverified_role') {
    return interaction.reply({
      components: [
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder().setCustomId(`cfg:unverified_role_select:${msgId}`).setPlaceholder('Select unverified role…')
        )
      ],
      flags: MessageFlags.Ephemeral
    });
  }

  if (action === 'select_channel') {
    return interaction.reply({
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder().setCustomId(`cfg:channel_select:${msgId}`).setPlaceholder('Select a channel…').addChannelTypes(ChannelType.GuildText)
        )
      ],
      flags: MessageFlags.Ephemeral
    });
  }

  if (action === 'select_name_format') {
    return interaction.reply({
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`cfg:name_format_select:${msgId}`)
            .setPlaceholder('Choose a name format…')
            .addOptions(
              { label: 'username', value: 'username' },
              { label: 'smart-name (Display @username)', value: 'smart' },
              { label: 'display-name', value: 'display' }
            )
        )
      ],
      flags: MessageFlags.Ephemeral
    });
  }

  if (action === 'toggle_verified_role') {
    const parts = interaction.customId.split(":");
    const page = parseInt(parts[3]) || 0;
    cfg.verifiedRoleEnabled = !cfg.verifiedRoleEnabled;
    await cfg.save();
    return interaction.update({ components: await buildConfigComponents(cfg, msgId, interaction.guild, page), flags: MessageFlags.IsComponentsV2 });
  }
  if (action === 'toggle_unverified') {
    const parts = interaction.customId.split(":");
    const page = parseInt(parts[3]) || 0;
    cfg.useUnverifiedRole = !cfg.useUnverifiedRole;
    await cfg.save();
    return interaction.update({ components: await buildConfigComponents(cfg, msgId, interaction.guild, page), flags: MessageFlags.IsComponentsV2 });
  }
  if (action === 'toggle_auto_verify_join') {
    const parts = interaction.customId.split(":");
    const page = parseInt(parts[3]) || 0;
    cfg.autoVerifyOnJoin = !cfg.autoVerifyOnJoin;
    await cfg.save();
    return interaction.update({ components: await buildConfigComponents(cfg, msgId, interaction.guild, page), flags: MessageFlags.IsComponentsV2 });
  }
  if (action === 'toggle_channel') {
    const parts = interaction.customId.split(":");
    const page = parseInt(parts[3]) || 0;
    cfg.verificationChannelEnabled = !cfg.verificationChannelEnabled;
    await cfg.save();
    return interaction.update({ components: await buildConfigComponents(cfg, msgId, interaction.guild, page), flags: MessageFlags.IsComponentsV2 });
  }
  if (action === 'toggle_name_sync') {
    const parts = interaction.customId.split(":");
    const page = parseInt(parts[3]) || 0;
    cfg.nameSyncEnabled = !cfg.nameSyncEnabled;
    await cfg.save();
    return interaction.update({ components: await buildConfigComponents(cfg, msgId, interaction.guild, page), flags: MessageFlags.IsComponentsV2 });
  }

  if (action === 'set_welcome' || action === 'set_age') {
    const modal = new ModalBuilder()
      .setCustomId(`cfgmodal:${action}:${msgId}`)
      .setTitle('Edit Setting');

    const input = new TextInputBuilder().setCustomId('value');
    if (action === 'set_welcome') {
      input
        .setLabel('Welcome Message:')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(cfg.welcomeMessage || '');
    }
    if (action === 'set_age') {
      input
        .setLabel('Minimum Roblox Account Age')
        .setStyle(TextInputStyle.Short)
        .setValue(cfg.requireAccountAge?.toString() || '');
    }
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (action === 'send_verification_post') {
    if (!cfg.verificationChannelEnabled || !cfg.verificationChannelId) {
      return interaction.reply({ content: `${e.open} Set and enable a verification channel first.`, flags: MessageFlags.Ephemeral });
    }
    try {
      const channel = await interaction.guild.channels.fetch(cfg.verificationChannelId);
      const permissions = channel.permissionsFor(interaction.guild.members.me);
      if (!permissions.has(['SendMessages', 'ViewChannel'])) {
        return interaction.reply({ content: `${e.denied} I don't have permission to send messages in that channel. Please check my permissions.`, flags: MessageFlags.Ephemeral });
      }
      const verificationMessage = `Welcome to **${interaction.guild.name}**! Verify with the button below to verify with Lumi and gain access to the rest of the server.`;
      await channel.send({
        content: verificationMessage,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Verify').setStyle(ButtonStyle.Success).setCustomId('universal_verify_button')
          )
        ]
      });
    } catch (e) {
      log.error('Send verification post failed', { error: e.message });
      return interaction.reply({ content: `${e.denied} Failed to send verification post: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
    try {
      const msg = await interaction.channel.messages.fetch(msgId);
      await msg.edit({ components: await buildConfigComponents(cfg, msgId, interaction.guild), flags: MessageFlags.IsComponentsV2 });
    } catch (e) {
      log.error('Failed to update config message after sending verification post', { error: e.message });
      return interaction.reply({ content: `${e.denied} Failed to update config message.`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: `${e.success} Verification post sent successfully!`, flags: MessageFlags.Ephemeral });
  }

  if (action === 'clear_verified_role') {
    cfg.verifiedRoleId = null;
    await cfg.save();
    try { await interaction.message.edit({ components: await buildConfigComponents(cfg, msgId, interaction.guild), flags: MessageFlags.IsComponentsV2 }); } catch(err) { log.error('Message edit (clear verified) failed', { error: err.message }); }
    return interaction.reply({ content: `${e.userRemove} Verified role cleared.`, flags: MessageFlags.Ephemeral });
  }
  if (action === 'clear_unverified_role') {
    cfg.unverifiedRoleId = null;
    await cfg.save();
    try { await interaction.message.edit({ components: await buildConfigComponents(cfg, msgId, interaction.guild), flags: MessageFlags.IsComponentsV2 }); } catch(err) { log.error('Message edit (clear unverified) failed', { error: err.message }); }
    return interaction.reply({ content: `${e.userRemove} Unverified role cleared.`, flags: MessageFlags.Ephemeral });
  }
  if (action === 'clear_channel') {
    cfg.verificationChannelId = null;
    await cfg.save();
    try { await interaction.message.edit({ components: await buildConfigComponents(cfg, msgId, interaction.guild), flags: MessageFlags.IsComponentsV2 }); } catch(err) { log.error('Message edit (clear channel) failed', { error: err.message }); }
    return interaction.reply({ content: `${e.open} Verification channel cleared.`, flags: MessageFlags.Ephemeral });
  }

  if (action === 'back_to_main') {
    return interaction.update({ components: [], flags: MessageFlags.Ephemeral });
  }
};
