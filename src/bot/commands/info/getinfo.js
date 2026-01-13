
const {
  SlashCommandBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ButtonBuilder,
  SeparatorBuilder, 
  SeparatorSpacingSize,
  ThumbnailBuilder
} = require('discord.js');
const { getRobloxUserById, resolveRobloxUsername, getRobloxAvatarHeadshot } = require('../../../utils/http');
const VerifiedUser = require('../../../models/verifiedUser');
const e = require('../../../../storage/emojis');

const STATUS = { YES: 'Yes', NO: 'No' };

function baseContainer(title) {
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${e.document} ${title}`));
  return c;
}

function buildRobloxContainer(profile, userId, avatarUrl, profileUrl) {
  const name = profile?.name || 'Unknown';
  const displayName = profile?.displayName || name;
  const description = profile?.description ? String(profile.description) : 'No description';
  const created = profile?.created ? `<t:${Math.floor(new Date(profile.created).getTime() / 1000)}:F>` : 'Unknown';

  const c = new ContainerBuilder();
  
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### [${displayName}](${profileUrl}) (${userId})`)
  );

  c.addSectionComponents(
    new SectionBuilder()
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(avatarUrl || 'https://via.placeholder.com/150')
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${e.robot} Roblox Information\n### ${displayName} (@${name})\nAccount Created: ${created}`)
      )
  );

  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## Description\n${description}`)
  );

  return c;
}

function buildDiscordContainer(user, member) {
  const username = user.username;
  const displayName = user.globalName || username;
  const created = user.createdAt ? `<t:${Math.floor(user.createdAt.getTime() / 1000)}:F>` : 'Unknown';
  const avatarUrl = user.displayAvatarURL({ size: 256 }) || user.defaultAvatarURL;

  const c = new ContainerBuilder();
  
  c.addSectionComponents(
    new SectionBuilder()
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(avatarUrl)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${e.discord} Discord Information\n### ${displayName} (@${username})\nAccount Created: ${created}`)
      )
  );

  return c;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('getinfo')
    .setDescription('Get information about a Discord or Roblox user')
    .addSubcommand(sc => sc
      .setName('discord')
      .setDescription('Lookup a Discord user')
      .addUserOption(opt => opt.setName('user').setDescription('The Discord user').setRequired(true))
    )
    .addSubcommand(sc => sc
      .setName('roblox')
      .setDescription('Lookup a Roblox account by username or user ID')
      .addStringOption(opt => opt.setName('query').setDescription('Roblox username or user ID').setRequired(true))
    ),

  async execute(interaction) {
    try { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); } catch (_) {}

    const sub = interaction.options.getSubcommand();

    if (sub === 'discord') {
      const user = interaction.options.getUser('user', true);
      const member = interaction.guild ? await interaction.guild.members.fetch(user.id).catch(() => null) : null;
      const record = await VerifiedUser.findOne({ discordId: user.id }).catch(() => null);

      const containers = [];

      if (record) {
        try {
          const profileResp = await getRobloxUserById(record.robloxId);
          const profile = profileResp.data || {};
          const avatarResp = await getRobloxAvatarHeadshot(record.robloxId, '420x420');
          const thumb = avatarResp.data && avatarResp.data.data && avatarResp.data.data[0];
          const avatarUrl = thumb && thumb.imageUrl ? thumb.imageUrl : null;
          const profileUrl = `https://www.roblox.com/users/${record.robloxId}/profile`;
          
          containers.push(buildRobloxContainer(profile, record.robloxId, avatarUrl, profileUrl));
        } catch (err) {

        }
      }

      containers.push(buildDiscordContainer(user, member));

      return interaction.editReply({ components: containers, flags: MessageFlags.IsComponentsV2 });
    }

    if (sub === 'roblox') {
      const query = interaction.options.getString('query', true).trim();
      const isId = /^\d{1,20}$/.test(query);

      try {
        let userId = null;
        if (isId) {
          userId = query;
        } else {
          const resolved = await resolveRobloxUsername(query);
          const data = resolved.data && resolved.data.data && resolved.data.data[0];
          if (!data || !data.hasOwnProperty('id')) {
            const container = baseContainer('Roblox Lookup').addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e.denied} No Roblox user found for "${query}".`))
                .setButtonAccessory(new ButtonBuilder().setLabel('Not Found').setStyle(ButtonStyle.Secondary).setCustomId('dummy_notfound').setDisabled(true))
            );
            return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
          }
          userId = String(data.id);
        }

        const profileResp = await getRobloxUserById(userId);
        const profile = profileResp.data || {};
        const avatarResp = await getRobloxAvatarHeadshot(userId, '420x420');
        const thumb = avatarResp.data && avatarResp.data.data && avatarResp.data.data[0];
        const avatarUrl = thumb && thumb.imageUrl ? thumb.imageUrl : null;
        const profileUrl = `https://www.roblox.com/users/${userId}/profile`;

        const containers = [];

        containers.push(buildRobloxContainer(profile, userId, avatarUrl, profileUrl));

        const linkedRecord = await VerifiedUser.findOne({ robloxId: String(userId) }).catch(() => null);
        if (linkedRecord) {
          const linkedDiscord = await interaction.client.users.fetch(linkedRecord.discordId).catch(() => null);
          const linkedMember = interaction.guild ? await interaction.guild.members.fetch(linkedRecord.discordId).catch(() => null) : null;
          if (linkedDiscord) {
            containers.push(buildDiscordContainer(linkedDiscord, linkedMember));
          }
        }

        return interaction.editReply({ components: containers, flags: MessageFlags.IsComponentsV2 });
      } catch (err) {
        const msg = isId ? `Failed to fetch Roblox user with ID ${query}.` : `Failed to fetch Roblox user for "${query}".`;
        const container = baseContainer('Roblox Lookup').addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e.denied} ${msg} Try again later.`))
            .setButtonAccessory(new ButtonBuilder().setLabel('Error').setStyle(ButtonStyle.Secondary).setCustomId('dummy_error2').setDisabled(true))
        );
        return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      }
    }

    const container = baseContainer('Get Info').addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Invalid subcommand.'))
        .setButtonAccessory(new ButtonBuilder().setLabel('Invalid').setStyle(ButtonStyle.Secondary).setCustomId('dummy_invalid').setDisabled(true))
    );
    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  }
};
