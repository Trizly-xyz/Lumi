
const { ActivityType } = require('discord.js');

const statuses = [
  { name: '🌐 trizly.xyz', type: ActivityType.Watching },
  { name: '📚 /help for commands', type: ActivityType.Listening },
  { name: '🔗 Verify with Roblox', type: ActivityType.Playing },
  { name: '⚡ Powered by Trizly', type: ActivityType.Playing },
];

module.exports = {
  name: 'clientReady',
  once: true,
  execute(client) {
    let statusIndex = 0;

    const updateStatus = () => {
      try {

        if (statusIndex === 0) {
          const serverCount = client.guilds.cache.size;
          client.user.setPresence({
            activities: [{
              name: `🌐 ${serverCount} servers | trizly.xyz`,
              type: ActivityType.Watching
            }],
            status: 'online'
          });
        }

        else if (statusIndex >= 1 && statusIndex <= statuses.length) {
          client.user.setPresence({
            activities: [statuses[statusIndex - 1]],
            status: 'online'
          });
        }

        else if (statusIndex === statuses.length + 1) {
          const memberCount = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
          client.user.setPresence({
            activities: [{
              name: `👥 ${memberCount.toLocaleString()} members | Trizly Systems`,
              type: ActivityType.Watching
            }],
            status: 'online'
          });
        }

        statusIndex = (statusIndex + 1) % (statuses.length + 2); // Cycle: 0, 1, 2, 3, 4, 5, 0, 1, ...
      } catch (err) {

      }
    };

    updateStatus();

    setInterval(updateStatus, 15000);
  }
};