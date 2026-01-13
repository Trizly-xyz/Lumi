
const verifyButton = require('../interactions/buttons/verifyButton');
const configButtons = require('../interactions/buttons/configButtons');

async function route(interaction, client) {
  const id = interaction.customId;
  if (id === 'universal_verify_button') {
    return verifyButton.handle(interaction, client);
  }
  if (id.startsWith('cfg:')) {
    return configButtons.handle(interaction, client);
  }

}

module.exports = { route };
