const { MessageFlags } = require('discord.js');
const e = require('../../../storage/emojis');
const baseLogger = require('../../utils/logger');
const log = baseLogger.child({ scope: 'command-router' });

module.exports.route = async function(interaction, client) {
  const command = client.commands.get(interaction.commandName);
  if (!command) {
    return interaction.reply({ content: `${e.code} Command not found.`, flags: MessageFlags.Ephemeral }).catch((err) => log.error('Command not found reply failed', { error: err.message }));
  }
  try {
    await command.execute(interaction, client);
  } catch (err) {
    log.error('execution failed', { error: err.message });
    try { await interaction.reply({ content: `${e.denied} Error executing command.`, flags: MessageFlags.Ephemeral }); } catch(err) { log.error('Error reply failed', { error: err.message }); }
  }
};
