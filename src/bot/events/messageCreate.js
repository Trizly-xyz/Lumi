const { MessageAttachment } = require('discord.js');
const logger = require('../../utils/logger');
const e = require('../../../storage/emojis');

const AUTHORIZED_USERS = [
  "926582079741890560",
  "711973114917027940",
  "1290068509509943306",
  "762104476785311796"
];

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message, client) {

    if (message.author.bot) return;

    const content = message.content.trim();

    if (content.startsWith('!say ') && AUTHORIZED_USERS.includes(message.author.id)) {
      const text = content.slice(5).trim();

      if (!text && message.attachments.size === 0) {
        return message.reply('You must provide text or an attachment to use the !say command.');
      }

      try {

        const attachments = message.attachments.map(attachment => new MessageAttachment(attachment.url));

        await message.channel.send({ content: text, files: attachments });

        logger.info('!say command executed', {
          userId: message.author.id,
          channelId: message.channel.id,
          text,
          attachments: message.attachments.size
        });

        await message.delete().catch(() => {});
      } catch (err) {
        logger.error('Failed to execute !say command', { error: err.message });
        return message.reply('Failed to execute the !say command. Please try again.');
      }
    }
  }
};
