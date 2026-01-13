
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ButtonBuilder,
  ActionRowBuilder
} = require("discord.js");

const GuildConfig = require("../../../models/guildConfig");
const e = require("../../../../storage/emojis");
const emojis = require("../../../../storage/emojis");

function formatNameSyncLabel(format) {
  switch (format) {
    case 'smart':
      return 'smart-name (Display @username)';
    case 'display':
      return 'display-name';
    default:
      return 'username';
  }
}

async function ensureGuildConfig(guildId) {
  return (
    (await GuildConfig.findOne({ guildId })) ||
    (await GuildConfig.create({ guildId }))
  );
}

async function canManageRole(guild, roleId) {
  if (!roleId) return true;
  try {
    const role = await guild.roles.fetch(roleId);
    if (!role) return false;

    const botMember = await guild.members.fetchMe();
    if (!botMember) return false;
    
    const botHighestRole = botMember.roles.highest;
    if (!botHighestRole) return false;

    return botHighestRole.position > role.position;
  } catch (err) {
    console.error('[canManageRole] Error:', err.message);
    return false;
  }
}

function getPermissionWarning(canDo) {
  return !canDo ? ` ${e.denied} *Bot role too low*` : '';
}

async function buildPanelPage(cfg, messageId, guild, page = 0) {
  const pages = [

    async () => {
      const c = new ContainerBuilder();
      c.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**Verified Role**\nStatus: ${cfg.verifiedRoleEnabled ? 'Enabled' : 'Disabled'}`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setLabel(cfg.verifiedRoleEnabled ? 'Enabled' : 'Disabled')
              .setEmoji(cfg.verifiedRoleEnabled ? e.enabled : e.disabled)
              .setStyle(cfg.verifiedRoleEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
              .setCustomId(`cfg:toggle_verified_role:${messageId}:0`)
          )
      );

      if (cfg.verifiedRoleEnabled) {
        const canManageVerified = await canManageRole(guild, cfg.verifiedRoleId);
        c.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `Current: ${cfg.verifiedRoleId ? `<@&${cfg.verifiedRoleId}>` : "*Not set*"}${cfg.verifiedRoleId ? getPermissionWarning(canManageVerified) : ''}`
              )
            )
            .setButtonAccessory(
              new ButtonBuilder()
                .setLabel(cfg.verifiedRoleId ? "Change" : "Set")
                .setStyle(ButtonStyle.Secondary)
                .setCustomId(`cfg:select_role:${messageId}`)
            )
        );
      }

      c.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**Auto-Verify on Join**\nStatus: ${cfg.autoVerifyOnJoin ? 'Enabled' : 'Disabled'}`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setLabel(cfg.autoVerifyOnJoin ? 'Enabled' : 'Disabled')
              .setEmoji(cfg.autoVerifyOnJoin ? e.enabled : e.disabled)
              .setStyle(cfg.autoVerifyOnJoin ? ButtonStyle.Success : ButtonStyle.Danger)
              .setCustomId(`cfg:toggle_auto_verify_join:${messageId}:0`)
          )
      );

      if (cfg.autoVerifyOnJoin) {
        c.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**Unverified Role**\nStatus: ${cfg.useUnverifiedRole ? 'Enabled' : 'Disabled'}`
              )
            )
            .setButtonAccessory(
              new ButtonBuilder()
                .setLabel(cfg.useUnverifiedRole ? 'Enabled' : 'Disabled')
                .setEmoji(cfg.useUnverifiedRole ? e.enabled : e.disabled)
                .setStyle(cfg.useUnverifiedRole ? ButtonStyle.Success : ButtonStyle.Danger)
                .setCustomId(`cfg:toggle_unverified:${messageId}:0`)
            )
        );

        if (cfg.useUnverifiedRole) {
          const canManageUnverified = await canManageRole(guild, cfg.unverifiedRoleId);
          c.addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  `Current: ${cfg.unverifiedRoleId ? `<@&${cfg.unverifiedRoleId}>` : "*Not set*"}${cfg.unverifiedRoleId ? getPermissionWarning(canManageUnverified) : ''}`
                )
              )
              .setButtonAccessory(
                new ButtonBuilder()
                  .setLabel(cfg.unverifiedRoleId ? "Change" : "Set")
                  .setStyle(ButtonStyle.Secondary)
                  .setCustomId(`cfg:select_unverified_role:${messageId}`)
              )
          );
        }
      }

      return c;
    },

    async () => {
      const c = new ContainerBuilder();
      c.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**Verification Channel**\nStatus: ${cfg.verificationChannelEnabled ? 'Enabled' : 'Disabled'}`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setLabel(cfg.verificationChannelEnabled ? 'Enabled' : 'Disabled')
              .setEmoji(cfg.verificationChannelEnabled ? e.enabled : e.disabled)
              .setStyle(cfg.verificationChannelEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
              .setCustomId(`cfg:toggle_channel:${messageId}:1`)
          )
      );

      if (cfg.verificationChannelEnabled) {
        c.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `Current: ${cfg.verificationChannelId ? `<#${cfg.verificationChannelId}>` : "*Not set*"}`
              )
            )
            .setButtonAccessory(
              new ButtonBuilder()
                .setLabel("Pick Channel")
                .setStyle(ButtonStyle.Secondary)
                .setCustomId(`cfg:select_channel:${messageId}`)
            )
        );

        c.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                "Send a verification post with a custom message and quick-authorize button."
              )
            )
            .setButtonAccessory(
              new ButtonBuilder()
                .setLabel("Send Verification Message")
                .setStyle(ButtonStyle.Success)
                .setCustomId(`cfg:send_verification_post:${messageId}`)
            )
        );
      }

      return c;
    },

    async () => {
      const c = new ContainerBuilder();
      c.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**Name Sync**\nStatus: ${cfg.nameSyncEnabled ? 'Enabled' : 'Disabled'}`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setLabel(cfg.nameSyncEnabled ? 'Enabled' : 'Disabled')
              .setEmoji(cfg.nameSyncEnabled ? e.enabled : e.disabled)
              .setStyle(cfg.nameSyncEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
              .setCustomId(`cfg:toggle_name_sync:${messageId}:2`)
          )
      );

      if (cfg.nameSyncEnabled) {
        c.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `Current Format: \`${formatNameSyncLabel(cfg.nameSyncFormat)}\``
              )
            )
            .setButtonAccessory(
              new ButtonBuilder()
                .setLabel("Change Format")
                .setStyle(ButtonStyle.Secondary)
                .setCustomId(`cfg:select_name_format:${messageId}`)
            )
        );
      }

      c.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**Welcome Message**\n\`${cfg.welcomeMessage}\``
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setLabel("Edit Welcome Message")
              .setStyle(ButtonStyle.Secondary)
              .setCustomId(`cfg:set_welcome:${messageId}`)
          )
      );

      c.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**Roblox Account Age Requirement**\nCurrent: ${
                cfg.requireAccountAge != null
                  ? `${cfg.requireAccountAge} days`
                  : "*None*"
              }`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setLabel("Set Minimum Age")
              .setStyle(ButtonStyle.Secondary)
              .setCustomId(`cfg:set_age:${messageId}`)
          )
      );

      return c;
    }
  ];

  const currentPage = Math.max(0, Math.min(page, pages.length - 1));
  const container = await pages[currentPage]();

  const prevPage = currentPage === 0 ? pages.length - 1 : currentPage - 1;
  const nextPage = (currentPage + 1) % pages.length;

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setEmoji(e.arrowLeft)
      .setStyle(ButtonStyle.Secondary)
      .setCustomId(`cfg:page_prev:${messageId}:${currentPage}`),
    new ButtonBuilder()
      .setEmoji(e.arrowRight)
      .setStyle(ButtonStyle.Secondary)
      .setCustomId(`cfg:page_next:${messageId}:${currentPage}`)
  );

  return [container, navRow];
}

async function buildPanel(cfg, messageId, guild) {
  return buildPanelPage(cfg, messageId, guild, 0);
}

module.exports = {
  buildPanel,
  buildPanelPage,
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Open server configuration panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {

    try {
      await interaction.deferReply();
    } catch (err) {
      console.error('Defer failed:', err.message);
      return;
    }

    if (!interaction.guildId) {
      const container = new ContainerBuilder().addSectionComponents(
        new SectionBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "This command can only be used inside a server."
          )
        )
      );

      return interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const cfg = await ensureGuildConfig(interaction.guildId);

    const placeholder = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${e.loading} Loading panel`)
    );

    let sent;
    try {
      sent = await interaction.editReply({
        components: [placeholder],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (err) {
      console.error('EditReply failed:', err.message);
      return;
    }

    const messageId = sent.id;

    const [pageContainer, navRow] = await buildPanelPage(cfg, messageId, interaction.guild, 0);

    try {
      return interaction.editReply({
        components: [pageContainer.toJSON(), navRow],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (err) {
      console.error('Panel edit failed:', err.message);
    }
  }
};
