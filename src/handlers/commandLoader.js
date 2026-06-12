import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getSubcommandInfo(commandData) {
  const subcommands = [];
  if (commandData.options) {
    for (const option of commandData.options) {
      if (option.type === 1) {
        subcommands.push(option.name);
      } else if (option.type === 2) {
        if (option.options) {
          for (const subOption of option.options) {
            if (subOption.type === 1) {
              subcommands.push(`${option.name}/${subOption.name}`);
            }
          }
        }
      }
    }
  }
  return subcommands;
}

async function getAllFiles(directory, fileList = []) {
  const files = await fs.readdir(directory, { withFileTypes: true });
  for (const file of files) {
    const filePath = path.join(directory, file.name);
    if (file.isDirectory()) {
      if (file.name === 'modules' || file.name === 'marizmamodalssetup') continue;
      await getAllFiles(filePath, fileList);
    } else if (file.name.endsWith('.js')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

export async function loadCommands(client) {
  client.commands = new Collection();
  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = await getAllFiles(commandsPath);

  logger.info(`Found ${commandFiles.length} command files to load`);

  const uniqueCommandNames = new Set();

  for (const filePath of commandFiles) {
    try {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const commandDir = path.dirname(filePath);
      const category = path.basename(commandDir);

      const commandModule = await import(`file://${filePath}`);
      const command = commandModule.default || commandModule;

      if (!command.data || !command.execute) {
        logger.warn(`Command at ${filePath} is missing required "data" or "execute" property.`);
        continue;
      }

      command.category = category;
      command.filePath = normalizedPath;

      const primaryCommandName = command.data.name;

      if (!uniqueCommandNames.has(primaryCommandName)) {
        uniqueCommandNames.add(primaryCommandName);
        client.commands.set(primaryCommandName, command);
      }

      const subcommands = getSubcommandInfo(command.data.toJSON());
      logger.info(`Loaded command: ${primaryCommandName} from ${normalizedPath} (category: ${category})`);
      if (subcommands.length > 0) {
        logger.info(`  - Subcommands: ${subcommands.join(', ')}`);
      }
    } catch (error) {
      logger.error(`Error loading command from ${filePath}:`, error);
    }
  }

  logger.info(`Loaded ${client.commands.size} commands`);
  return client.commands;
}

export async function registerCommands(client, guildId) {
  try {
    const commands = [];
    let totalSubcommands = 0;
    const registeredNames = new Set();

    for (const command of client.commands.values()) {
      if (command.data && typeof command.data.toJSON === 'function') {
        const commandName = command.data.name;
        if (!registeredNames.has(commandName)) {
          registeredNames.add(commandName);
          const commandJson = command.data.toJSON();
          commands.push(commandJson);
          totalSubcommands += getSubcommandInfo(commandJson).length;
        }
      } else {
        logger.warn(`Command missing data or toJSON method: ${command}`);
      }
    }

    // Validate commands
    const validationErrors = [];
    commands.forEach(cmd => {
      if (cmd.name?.length > 32) validationErrors.push(`Command ${cmd.name} name too long`);
      if (cmd.description?.length > 110) validationErrors.push(`Command ${cmd.name} description too long`);
      cmd.options?.forEach(option => {
        if (option.name?.length > 32) validationErrors.push(`Command ${cmd.name} option ${option.name} name too long`);
        if (option.description?.length > 110) validationErrors.push(`Command ${cmd.name} option ${option.name} description too long`);
        option.options?.forEach(subOption => {
          if (subOption.name?.length > 32) validationErrors.push(`Command ${cmd.name} subcommand option ${subOption.name} name too long`);
          if (subOption.description?.length > 110) validationErrors.push(`Command ${cmd.name} subcommand option ${subOption.name} description too long`);
        });
      });
    });

    if (validationErrors.length > 0) {
      validationErrors.forEach(e => logger.error(`  - ${e}`));
      throw new Error(`Command validation failed with ${validationErrors.length} errors`);
    }

    const commandsToRegister = commands.slice(0, 100);

    // ── GLOBAL REGISTRATION ──────────────────────────────────
    // Global commands appear in ALL servers the bot is in.
    // They take up to 1 hour to propagate after deployment.
    // To use guild-only (instant) during development, pass a guildId
    // via env var GUILD_ID and flip the condition below.

    if (process.env.NODE_ENV !== 'production' && guildId) {
      // Development: register to specific guild (instant)
      logger.info(`[DEV] Registering ${commandsToRegister.length} commands to guild ${guildId}`);
      const guild = await client.guilds.fetch(guildId);
      await guild.commands.set(commandsToRegister);
      logger.info(`[DEV] Successfully registered ${commandsToRegister.length} guild commands`);
    } else {
      // Production: register globally (works in all servers)
      logger.info(`Registering ${commandsToRegister.length} commands globally...`);
      await client.application.commands.set(commandsToRegister);
      logger.info(`Successfully registered ${commandsToRegister.length} global commands`);
    }

  } catch (error) {
    logger.error('Error registering commands:', error);
    throw error;
  }
}

export async function reloadCommand(client, commandName) {
  const command = client.commands.get(commandName);
  if (!command) return { success: false, message: `Command "${commandName}" not found` };

  try {
    const commandPath = path.resolve(command.filePath);
    const moduleUrl = pathToFileURL(commandPath);
    moduleUrl.searchParams.set('t', Date.now().toString());
    const newCommand = (await import(moduleUrl.href)).default;
    client.commands.set(commandName, newCommand);
    logger.info(`Reloaded command: ${commandName}`);
    return { success: true, message: `Successfully reloaded command "${commandName}"` };
  } catch (error) {
    logger.error(`Error reloading command "${commandName}":`, error);
    return { success: false, message: `Error reloading command: ${error.message}` };
  }
}