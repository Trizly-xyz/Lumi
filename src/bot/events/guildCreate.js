const { EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
  name: 'guildCreate',
  once: false,
  async execute(guild, client) {
    try {
      logger.info('Joined a new guild', { guildId: guild.id, guildName: guild.name });

      const owner = await guild.fetchOwner();

      const serverInfoEmbed = new EmbedBuilder()
        .setTitle('Lumi Joined a New Server!')
        .setColor(0x00AE86)
        .addFields(
          { name: 'Server Name', value: guild.name, inline: true },
          { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
          { name: 'Server Owner', value: `${owner.user.tag} (<@${owner.id}>)`, inline: false }
        )
        .setTimestamp();

      client.channels.cache.get("1449815748913659965")?.send({ embeds: [serverInfoEmbed] });

      const invite = await guild.invites.create(guild.systemChannel || guild.channels.cache.find(c => c.type === 0), {
        maxAge: 0,
        maxUses: 0
      });

      const inviteEmbed = new EmbedBuilder()
        .setTitle('Lumi Join - Server Invite')
        .setColor(0x00AE86)
        .setDescription(`Server Name: ${guild.name}
Invite Link: ${invite.url}`)
        .setTimestamp();

      client.channels.cache.get("1451623038318673970")?.send({ embeds: [inviteEmbed] });
    } catch (err) {
      logger.error('GUILD CREATE ERROR', { guildId: guild.id, guildName: guild.name, error: err.message, stack: err.stack });
    }
  }
};
