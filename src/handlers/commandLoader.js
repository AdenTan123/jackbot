import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  for (const filePath of commandFiles) {
    try {
      const commandModule = await import(`file://${filePath}`);
      const command = commandModule.default || commandModule;

      if (!command.data || !command.execute) {
        logger.warn(`Invalid command file: ${filePath}`);
        continue;
      }

      client.commands.set(command.data.name, command);

      logger.info(`Loaded command: ${command.data.name}`);
    } catch (error) {
      logger.error(`Error loading command ${filePath}:`, error);
    }
  }

  logger.info(`Loaded ${client.commands.size} commands`);
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
    return { success: true };
  } catch (error) {
    logger.error(`Error reloading command "${commandName}":`, error);
    return { success: false, message: error.message };
  }
}