
const configModals = require('../interactions/modals/configModals');

async function route(interaction, client) {
  const id = interaction.customId || '';
  if (id.startsWith('cfgmodal:')) {
    return configModals.handle(interaction, client);
  }
}

module.exports = { route };
