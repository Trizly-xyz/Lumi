const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const handleCommands = require('./handlers/handleCommands');
const GuildConfig = require('../models/guildConfig');
const registerVerificationHandler = require('./handlers/verificationHandler');

module.exports = function startBot(eventBus, logger) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.commands = new Collection();
  handleCommands(client);
  client.handleCommands();

  const eventsRoot = path.join(__dirname, 'events');
  function loadEventsRecursively(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        loadEventsRecursively(fullPath);
        continue;
      }
      if (!entry.name.endsWith('.js')) continue;
      const event = require(fullPath);
      if (!event || !event.name || typeof event.execute !== 'function') continue;
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
    }
  }
  loadEventsRecursively(eventsRoot);

  eventBus.on('userUnlinked', async ({ discordId, guildId }) => {
    try {
      if (guildId) {

        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(discordId);
        let verifiedRoleId = null;
        let unverifiedRoleId = null;
        let useUnverified = false;
        try {
          const cfg = await GuildConfig.findOne({ guildId });
          verifiedRoleId = (cfg && cfg.verifiedRoleId) || process.env.VERIFIED_ROLE;
          unverifiedRoleId = cfg?.unverifiedRoleId || null;
          useUnverified = !!cfg?.useUnverifiedRole;
        } catch (_) {}
        if (verifiedRoleId && member.roles.cache.has(verifiedRoleId)) {
          await member.roles.remove(verifiedRoleId).catch(() => {});
        }
        if (useUnverified && unverifiedRoleId && !member.roles.cache.has(unverifiedRoleId)) {
          await member.roles.add(unverifiedRoleId, 'Adding unverified role (unlink)').catch(() => {});
        }
      } else {

        for (const [gId, guild] of client.guilds.cache) {
          try {
            const member = await guild.members.fetch(discordId);
            let verifiedRoleId = null;
            let unverifiedRoleId = null;
            let useUnverified = false;
            try {
              const cfg = await GuildConfig.findOne({ guildId: gId });
              verifiedRoleId = (cfg && cfg.verifiedRoleId) || process.env.VERIFIED_ROLE;
              unverifiedRoleId = cfg?.unverifiedRoleId || null;
              useUnverified = !!cfg?.useUnverifiedRole;
            } catch (err) {
              logger.warn('Failed to fetch config during global unlink', { guildId: gId, error: err.message });
            }
            if (verifiedRoleId && member.roles.cache.has(verifiedRoleId)) {
              await member.roles.remove(verifiedRoleId).catch(() => {});
            }
            if (useUnverified && unverifiedRoleId && !member.roles.cache.has(unverifiedRoleId)) {
              await member.roles.add(unverifiedRoleId, 'Adding unverified role (unlink)').catch(() => {});
            }
          } catch (err) {

          }
        }
      }
    } catch (err) {
      logger.error('Unlink event error', { error: err.message, stack: err.stack });
    }
  });

  registerVerificationHandler(eventBus, client, logger);

  client.login(process.env.TOKEN).catch((err) => {
    logger.error('Bot login failed', { error: err.message });
    process.exit(1);
  });
  
  return client;
};

