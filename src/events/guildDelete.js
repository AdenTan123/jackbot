import { Events } from 'discord.js';
import { deleteGuildData } from '../utils/database.js'; // ⚠️ DOUBLE CHECK: Change this path to point to your database file where deleteGuildData lives
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildDelete,

  async execute(guild, client) {
    // This event triggers automatically whenever the bot leaves or is kicked from a server
    logger.warn(`⚠️ Bot has been removed from server: "${guild.name}" (${guild.id}). Initiating profile cleanup sequence...`);
    
    try {
      await deleteGuildData(client, guild.id);
    } catch (error) {
      logger.error(`Failed to handle automated data eviction process for guild profile ${guild.id}:`, error);
    }
  },
};