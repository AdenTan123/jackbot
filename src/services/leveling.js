import { logger } from '../utils/logger.js';

/**
 * Fetches the leveling configuration state for a specific guild
 * @param {Client} client - The Discord client instance
 * @param {string} guildId - The ID of the guild
 * @returns {Promise<object>} Configuration object containing an 'enabled' boolean
 */
export async function getLevelingConfig(client, guildId) {
    try {
        const configKey = `guild:${guildId}:leveling`;
        const config = await client.db?.get(configKey) || { enabled: false };
        
        return {
            enabled: config.enabled ?? false,
            ...config
        };
    } catch (error) {
        logger.error(`Failed to retrieve leveling configuration for guild ${guildId}:`, error);
        return { enabled: false };
    }
}

/**
 * Completely purges a user's leveling metrics when they leave the server
 * @param {Client} client - The Discord client instance
 * @param {string} guildId - The ID of the guild
 * @param {string} userId - The ID of the departing member
 * @returns {Promise<boolean>} True if successful
 */
export async function deleteUserLevelData(client, guildId, userId) {
    try {
        const xpKey = `guild:${guildId}:user:${userId}:xp`;
        const levelKey = `guild:${guildId}:user:${userId}:level`;

        if (client.db) {
            await client.db.delete(xpKey).catch(() => null);
            await client.db.delete(levelKey).catch(() => null);
            logger.debug(`Successfully purged leveling database records for user ${userId} in guild ${guildId}`);
            return true;
        }
        return false;
    } catch (error) {
        logger.error(`Failed to delete leveling data for user ${userId} on leave:`, error);
        return false;
    }
}