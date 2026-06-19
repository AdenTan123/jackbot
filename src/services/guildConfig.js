import { getGuildConfig as getGuildConfigDb, setGuildConfig as setGuildConfigDb } from '../utils/database.js';
import { BotConfig } from '../config/bot.js';
import { normalizeGuildConfig, validateGuildConfigOrThrow } from '../utils/schemas.js';
import { wrapServiceBoundary } from '../utils/serviceErrorBoundary.js';
import { logger } from '../utils/logger.js';

const GUILD_CONFIG_DEFAULTS = {
    prefix: BotConfig.prefix,
    modRole: null,
    adminRole: null,
    logChannelId: null,
    welcomeChannel: null,
    welcomeMessage: 'Welcome {user} to {server}!',
    autoRole: null,
    dmOnClose: true,
    logIgnore: { users: [], channels: [] },
    logging: {
        enabled: false,
        channelId: null,
        enabledEvents: {}
    },
    counting: {
        channelId: null,
        lastNumber: 0,
        lastUserId: null,
        allowMath: true,
        deleteNonWords: false
    },
    competition: {
        active: false,
        eventType: null,
        maxSubmissions: 1,
        categoryId: null,
        category: null,
        submissions: {}
    },
    // ============================================
    // TICKET SYSTEM CONFIGURATION
    // ============================================
    ticketCategoryId: null,
    ticketLogChannelId: null,
    ticketClosedCategoryId: null,
    ticketTranscriptChannelId: null,
    ticketStaffRoleId: null,
    maxTicketsPerUser: 3,
    tickets: {
        enablePriority: true,
        maxTicketsPerUser: 3,
    }
};

// Track which guilds we've already warned about to avoid log spam
const warnedGuilds = new Set();

function logGuildWarning(guildId, message, error = null) {
    // Only warn once per guild per session to prevent spam
    const warnKey = `${guildId}:${message}`;
    if (!warnedGuilds.has(warnKey)) {
        warnedGuilds.add(warnKey);
        logger.warn(`[GuildConfig] Guild ${guildId}: ${message}`, {
            guildId,
            error: error?.message,
            errorCode: error?.code
        });
    }
}

function logGuildError(guildId, operation, error) {
    logger.error(`[GuildConfig] ${operation} failed for guild ${guildId}`, {
        guildId,
        operation,
        error: error?.message,
        errorCode: error?.code,
        stack: error?.stack
    });
}

export const getGuildConfig = wrapServiceBoundary(async function getGuildConfig(client, guildId, context = {}) {
    logger.debug(`[GuildConfig] Fetching config for guild ${guildId}`);
    
    try {
        const config = await getGuildConfigDb(client, guildId, context);
        
        if (!config || Object.keys(config).length === 0) {
            logger.debug(`[GuildConfig] No config found for guild ${guildId}, using defaults`);
            // Return defaults for new guilds
            return { ...GUILD_CONFIG_DEFAULTS };
        }
        
        const normalized = normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
        
        // Validate that ticket fields exist
        if (!normalized.hasOwnProperty('ticketCategoryId')) {
            logger.debug(`[GuildConfig] Adding missing ticket fields for guild ${guildId}`);
            normalized.ticketCategoryId = GUILD_CONFIG_DEFAULTS.ticketCategoryId;
            normalized.ticketLogChannelId = GUILD_CONFIG_DEFAULTS.ticketLogChannelId;
            normalized.ticketClosedCategoryId = GUILD_CONFIG_DEFAULTS.ticketClosedCategoryId;
            normalized.ticketTranscriptChannelId = GUILD_CONFIG_DEFAULTS.ticketTranscriptChannelId;
            normalized.ticketStaffRoleId = GUILD_CONFIG_DEFAULTS.ticketStaffRoleId;
            normalized.maxTicketsPerUser = GUILD_CONFIG_DEFAULTS.maxTicketsPerUser;
        }
        
        logger.debug(`[GuildConfig] Successfully fetched config for guild ${guildId}`);
        return normalized;
        
    } catch (error) {
        logGuildError(guildId, 'getGuildConfig', error);
        
        // If database fails, return defaults so the bot doesn't crash
        logGuildWarning(guildId, 'Database fetch failed, using default config', error);
        return { ...GUILD_CONFIG_DEFAULTS };
    }
}, {
    service: 'guildConfigService',
    operation: 'getGuildConfig',
    message: 'Failed to fetch guild configuration',
    userMessage: 'Failed to load server configuration. Please try again.'
});

export const setGuildConfig = wrapServiceBoundary(async function setGuildConfig(client, guildId, config, context = {}) {
    logger.debug(`[GuildConfig] Setting config for guild ${guildId}`, {
        hasTicketCategory: !!config?.ticketCategoryId,
        configKeys: config ? Object.keys(config) : []
    });
    
    try {
        if (!config || Object.keys(config).length === 0) {
            logger.warn(`[GuildConfig] Attempted to set empty config for guild ${guildId}`);
            return null;
        }
        
        const normalized = normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
        const validated = validateGuildConfigOrThrow(normalized, { guildId, ...context });
        
        const result = await setGuildConfigDb(client, guildId, validated, context);
        
        logger.debug(`[GuildConfig] Successfully saved config for guild ${guildId}`, {
            ticketCategoryId: validated.ticketCategoryId,
            hasTicketConfig: !!validated.ticketCategoryId
        });
        
        return result;
        
    } catch (error) {
        logGuildError(guildId, 'setGuildConfig', error);
        
        // Try to save without validation as fallback
        try {
            logger.warn(`[GuildConfig] Attempting fallback save without validation for guild ${guildId}`);
            const normalized = normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
            const result = await setGuildConfigDb(client, guildId, normalized, context);
            logger.debug(`[GuildConfig] Fallback save succeeded for guild ${guildId}`);
            return result;
        } catch (fallbackError) {
            logGuildError(guildId, 'setGuildConfig fallback', fallbackError);
            throw error; // Throw original error
        }
    }
}, {
    service: 'guildConfigService',
    operation: 'setGuildConfig',
    message: 'Failed to save guild configuration',
    userMessage: 'Failed to save server configuration. Please try again.'
});

export const updateGuildConfig = wrapServiceBoundary(async function updateGuildConfig(client, guildId, updates, context = {}) {
    logger.debug(`[GuildConfig] Updating config for guild ${guildId}`, {
        updateKeys: updates ? Object.keys(updates) : [],
        hasTicketUpdate: !!updates?.ticketCategoryId
    });
    
    try {
        if (!updates || Object.keys(updates).length === 0) {
            logger.warn(`[GuildConfig] Attempted empty update for guild ${guildId}`);
            return null;
        }
        
        // Try to get current config, fallback to empty object
        let currentConfig;
        try {
            currentConfig = await getGuildConfigDb(client, guildId, context);
            if (!currentConfig) {
                logger.debug(`[GuildConfig] No existing config for guild ${guildId}, creating new one`);
                currentConfig = {};
            }
        } catch (fetchError) {
            logGuildWarning(guildId, 'Failed to fetch current config for update, using empty config', fetchError);
            currentConfig = {};
        }
        
        // Merge current with updates
        const newConfig = { ...currentConfig, ...updates };
        
        logger.debug(`[GuildConfig] Merged config for guild ${guildId}`, {
            ticketCategoryId: newConfig.ticketCategoryId,
            hasTicketConfig: !!newConfig.ticketCategoryId
        });
        
        const normalized = normalizeGuildConfig(newConfig, GUILD_CONFIG_DEFAULTS);
        
        // Validate, but don't throw if validation fails
        let validated;
        try {
            validated = validateGuildConfigOrThrow(normalized, { guildId, ...context });
        } catch (validationError) {
            logger.warn(`[GuildConfig] Validation warning for guild ${guildId}, using unvalidated config`, {
                error: validationError.message
            });
            validated = normalized; // Use unvalidated but normalized config
        }
        
        const result = await setGuildConfigDb(client, guildId, validated, context);
        
        logger.debug(`[GuildConfig] Successfully updated config for guild ${guildId}`, {
            ticketCategoryId: validated.ticketCategoryId,
            updatedKeys: Object.keys(updates)
        });
        
        // Clear warning cache for this guild since config is now saved
        warnedGuilds.clear();
        
        return result;
        
    } catch (error) {
        logGuildError(guildId, 'updateGuildConfig', error);
        
        // Last resort: try to save just the updates directly
        try {
            logger.warn(`[GuildConfig] Attempting direct save for guild ${guildId}`);
            const result = await setGuildConfigDb(client, guildId, updates, context);
            logger.debug(`[GuildConfig] Direct save succeeded for guild ${guildId}`);
            warnedGuilds.clear();
            return result;
        } catch (directError) {
            logGuildError(guildId, 'updateGuildConfig direct save', directError);
            throw error; // Throw original error
        }
    }
}, {
    service: 'guildConfigService',
    operation: 'updateGuildConfig',
    message: 'Failed to update guild configuration',
    userMessage: 'Failed to update server configuration. Please try again.'
});

export const getConfigValue = wrapServiceBoundary(async function getConfigValue(client, guildId, key, defaultValue = null, context = {}) {
    logger.debug(`[GuildConfig] Getting config value '${key}' for guild ${guildId}`);
    
    try {
        const config = await getGuildConfig(client, guildId, context);
        
        if (!config) {
            logger.debug(`[GuildConfig] No config found for guild ${guildId}, returning default for '${key}'`);
            return defaultValue;
        }
        
        const value = config[key] !== undefined ? config[key] : defaultValue;
        
        logger.debug(`[GuildConfig] Got config value '${key}' for guild ${guildId}: ${value}`);
        return value;
        
    } catch (error) {
        logGuildError(guildId, `getConfigValue:${key}`, error);
        return defaultValue;
    }
}, {
    service: 'guildConfigService',
    operation: 'getConfigValue',
    message: 'Failed to read guild configuration value',
    userMessage: 'Failed to read a server setting. Please try again.'
});

export const setConfigValue = wrapServiceBoundary(async function setConfigValue(client, guildId, key, value, context = {}) {
    logger.debug(`[GuildConfig] Setting config value '${key}' for guild ${guildId}`, { value });
    
    try {
        const result = await updateGuildConfig(client, guildId, { [key]: value }, context);
        
        logger.debug(`[GuildConfig] Successfully set '${key}' for guild ${guildId}`);
        return result;
        
    } catch (error) {
        logGuildError(guildId, `setConfigValue:${key}`, error);
        throw error;
    }
}, {
    service: 'guildConfigService',
    operation: 'setConfigValue',
    message: 'Failed to update guild configuration value',
    userMessage: 'Failed to update a server setting. Please try again.'
});

// Utility function to check if ticket system is configured
export async function isTicketSystemConfigured(client, guildId) {
    try {
        const config = await getGuildConfig(client, guildId);
        const isConfigured = !!config?.ticketCategoryId;
        
        logger.debug(`[GuildConfig] Ticket system check for guild ${guildId}: ${isConfigured ? 'configured' : 'not configured'}`, {
            ticketCategoryId: config?.ticketCategoryId
        });
        
        return isConfigured;
    } catch (error) {
        logGuildError(guildId, 'isTicketSystemConfigured', error);
        return false;
    }
}

// Utility function to get ticket-specific config
export async function getTicketConfig(client, guildId) {
    try {
        const config = await getGuildConfig(client, guildId);
        
        const ticketConfig = {
            categoryId: config?.ticketCategoryId ?? null,
            logChannelId: config?.ticketLogChannelId ?? null,
            closedCategoryId: config?.ticketClosedCategoryId ?? null,
            transcriptChannelId: config?.ticketTranscriptChannelId ?? null,
            staffRoleId: config?.ticketStaffRoleId ?? null,
            maxTicketsPerUser: config?.maxTicketsPerUser ?? 3,
            dmOnClose: config?.dmOnClose ?? true,
            enablePriority: config?.tickets?.enablePriority ?? true,
        };
        
        logger.debug(`[GuildConfig] Ticket config for guild ${guildId}`, ticketConfig);
        
        return ticketConfig;
    } catch (error) {
        logGuildError(guildId, 'getTicketConfig', error);
        
        // Return default ticket config on error
        return {
            categoryId: null,
            logChannelId: null,
            closedCategoryId: null,
            transcriptChannelId: null,
            staffRoleId: null,
            maxTicketsPerUser: 3,
            dmOnClose: true,
            enablePriority: true,
        };
    }
}