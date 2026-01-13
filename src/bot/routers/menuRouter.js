
const configMenus = require('../interactions/menus/configMenus');

async function route(interaction, client) {
  const id = interaction.customId || '';
  if (id.startsWith('cfg:')) {
    return configMenus.handle(interaction, client);
  }
}

module.exports = { route };
