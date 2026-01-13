const { EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
  name: 'guildDelete',
  once: false,
  async execute(guild, client) {
    try {

      const serverLeaveEmbed = new EmbedBuilder()
        .setTitle('Lumi Left a Server')
        .setColor(0xFF0000)
        .addFields(
          { name: 'Server Name', value: guild.name, inline: true },
          { name: 'Server ID', value: `\`${guild.id}\``, inline: true }
        )
        .setTimestamp();

      client.channels.cache.get("1449815748913659965")?.send({ embeds: [serverLeaveEmbed] });

    } catch (err) {
      logger.error('guildDelete event error', { error: err.message, stack: err.stack });
    }
  }
};
