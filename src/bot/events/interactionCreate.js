
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags
} = require("discord.js");

const GuildConfig = require("../../models/guildConfig");
const { buildPanel, buildPanelPage } = require("../commands/admin/config");
const e = require("../../../storage/emojis");
const VerifiedUser = require("../../models/verifiedUser");
const eventBus = require("../../utils/eventBus");
const buttonRouter = require('../routers/buttonRouter');
const menuRouter = require('../routers/menuRouter');
const modalRouter = require('../routers/modalRouter');

async function ensureGuildConfig(guildId) {
  const cfg = await GuildConfig.findOne({ guildId });
  return cfg || await GuildConfig.create({ guildId });
}

function buildConfigComponents(cfg, messageId, page = 0) {
  const [pageContainer, navRow] = buildPanelPage(cfg, messageId, page);
  return [pageContainer.toJSON(), navRow];
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction, client) {
    const startTs = Date.now();
    const tag = `[INT:${interaction?.id || 'unknown'}]`;
    const log = () => {}; // Silent - only warns/errors matter
    try {
      log('Received interaction', { type: interaction.type, command: interaction.commandName });
      if (interaction.isChatInputCommand()) {
        const commandRouter = require('../routers/commandRouter');
        await commandRouter.route(interaction, client);
        return;
      }

      if (interaction.isButton()) {
        return buttonRouter.route(interaction, client);
      }
      if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu()) {
        return menuRouter.route(interaction, client);
      }
      if (interaction.isModalSubmit()) {
        return modalRouter.route(interaction, client);
      }

        if (interaction.isButton()) {
          return buttonRouter.route(interaction, client);
        }
        if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu()) {
          return menuRouter.route(interaction, client);
        }
        if (interaction.isModalSubmit()) {
          return modalRouter.route(interaction, client);
        }
      try { if (interaction && !interaction.replied) interaction.reply({ content: `${e.denied} Internal error.`, flags: MessageFlags.Ephemeral }); } catch(err) { console.error('[interactionCreate] Final error reply failed', err.message); }
    } finally {
      log('Interaction finished', { ms: Date.now() - startTs });
    }
  }
};
