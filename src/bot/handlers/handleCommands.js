
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

module.exports = function (client) {
  client.handleCommands = async () => {
    client.commandArray = [];

    const commandsPath = path.join(__dirname, "..", "commands");

    const commandFolders = fs.readdirSync(commandsPath);

    for (const folder of commandFolders) {
      const folderPath = path.join(commandsPath, folder);

      const commandFiles = fs
        .readdirSync(folderPath)
        .filter((file) => file.endsWith(".js"));

      for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);

        if (!command.data) {
          console.warn(
            `⚠️ Skipped ${file} — missing command.data`
          );
          continue;
        }

        if (typeof command.data.toJSON !== "function") {
          console.warn(
            `⚠️ Skipped ${file} — command.data missing toJSON()`
          );
          continue;
        }

        client.commands.set(command.data.name, command);
        client.commandArray.push(command.data.toJSON());
      }
    }

    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    try {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: client.commandArray }
      );
    } catch (err) {
      console.error("FAILED LOADING COMMANDS:", err);
    }
  };
};
