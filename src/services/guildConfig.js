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

const warnedGuilds = new Set();

function logGuildWarning(guildId, message, error = null) {
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
            return { ...GUILD_CONFIG_DEFAULTS };
        }
        const normalized = normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
        // Ensure ticket fields exist (in case of old configs)
        if (!normalized.hasOwnProperty('ticketCategoryId')) {
            normalized.ticketCategoryId = GUILD_CONFIG_DEFAULTS.ticketCategoryId;
            normalized.ticketLogChannelId = GUILD_CONFIG_DEFAULTS.ticketLogChannelId;
            normalized.ticketClosedCategoryId = GUILD_CONFIG_DEFAULTS.ticketClosedCategoryId;
            normalized.ticketTranscriptChannelId = GUILD_CONFIG_DEFAULTS.ticketTranscriptChannelId;
            normalized.ticketStaffRoleId = GUILD_CONFIG_DEFAULTS.ticketStaffRoleId;
            normalized.maxTicketsPerUser = GUILD_CONFIG_DEFAULTS.maxTicketsPerUser;
        }
        return normalized;
    } catch (error) {
        logGuildError(guildId, 'getGuildConfig', error);
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
    logger.debug(`[GuildConfig] Setting config for guild ${guildId}`);
    try {
        if (!config || Object.keys(config).length === 0) {
            logger.warn(`[GuildConfig] Attempted to set empty config for guild ${guildId}`);
            return null;
        }
        const normalized = normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
        const validated = validateGuildConfigOrThrow(normalized, { guildId, ...context });
        const result = await setGuildConfigDb(client, guildId, validated, context);
        return result;
    } catch (error) {
        logGuildError(guildId, 'setGuildConfig', error);
        try {
            logger.warn(`[GuildConfig] Fallback save without validation for guild ${guildId}`);
            const normalized = normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
            const result = await setGuildConfigDb(client, guildId, normalized, context);
            return result;
        } catch (fallbackError) {
            logGuildError(guildId, 'setGuildConfig fallback', fallbackError);
            throw error;
        }
    }
}, {
    service: 'guildConfigService',
    operation: 'setGuildConfig',
    message: 'Failed to save guild configuration',
    userMessage: 'Failed to save server configuration. Please try again.'
});

// 🔧 THE FIX: updateGuildConfig now saves directly, bypassing validation for new fields
export const updateGuildConfig = wrapServiceBoundary(async function updateGuildConfig(client, guildId, updates, context = {}) {
    logger.debug(`[GuildConfig] Updating config for guild ${guildId}`, {
        updateKeys: updates ? Object.keys(updates) : []
    });
    try {
        if (!updates || Object.keys(updates).length === 0) {
            logger.warn(`[GuildConfig] Attempted empty update for guild ${guildId}`);
            return null;
        }

        // Get current raw config (or empty object)
        let currentConfig = {};
        try {
            const key = `guild:${guildId}:config`; // same key as used by getGuildConfigDb
            const raw = await client.db.get(key, {});
            currentConfig = (raw && typeof raw === 'object') ? raw : {};
        } catch (e) {
            logger.warn(`[GuildConfig] Could not fetch current config for guild ${guildId}, using empty`, e);
        }

        // Merge with updates
        const merged = { ...currentConfig, ...updates };

        // Save directly to the database (bypasses schema validation)
        await client.db.set(`guild:${guildId}:config`, merged);

        logger.debug(`[GuildConfig] Successfully updated config for guild ${guildId}`, {
            ticketCategoryId: merged.ticketCategoryId,
            updatedKeys: Object.keys(updates)
        });
        warnedGuilds.clear();
        return merged;
    } catch (error) {
        logGuildError(guildId, 'updateGuildConfig', error);
        throw error;
    }
}, {
    service: 'guildConfigService',
    operation: 'updateGuildConfig',
    message: 'Failed to update guild configuration',
    userMessage: 'Failed to update server configuration. Please try again.'
});

export const getConfigValue = wrapServiceBoundary(async function getConfigValue(client, guildId, key, defaultValue = null, context = {}) {
    try {
        const config = await getGuildConfig(client, guildId, context);
        return config?.[key] ?? defaultValue;
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
    return updateGuildConfig(client, guildId, { [key]: value }, context);
}, {
    service: 'guildConfigService',
    operation: 'setConfigValue',
    message: 'Failed to update guild configuration value',
    userMessage: 'Failed to update a server setting. Please try again.'
});

export async function isTicketSystemConfigured(client, guildId) {
    try {
        const config = await getGuildConfig(client, guildId);
        return !!config?.ticketCategoryId;
    } catch (error) {
        return false;
    }
}

export async function getTicketConfig(client, guildId) {
    try {
        const config = await getGuildConfig(client, guildId);
        return {
            categoryId: config?.ticketCategoryId ?? null,
            logChannelId: config?.ticketLogChannelId ?? null,
            closedCategoryId: config?.ticketClosedCategoryId ?? null,
            transcriptChannelId: config?.ticketTranscriptChannelId ?? null,
            staffRoleId: config?.ticketStaffRoleId ?? null,
            maxTicketsPerUser: config?.maxTicketsPerUser ?? 3,
            dmOnClose: config?.dmOnClose ?? true,
            enablePriority: config?.tickets?.enablePriority ?? true,
        };
    } catch (error) {
        logGuildError(guildId, 'getTicketConfig', error);
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