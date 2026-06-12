import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import express from 'express';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import { getServerCounters, saveServerCounters, updateCounter } from './services/serverstatsService.js';
import { logger, startupLog, shutdownLog } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import { loadCommands } from './handlers/commandLoader.js';

class TitanBot extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message, Partials.User],
    });

    this.config = config;
    this.commands = new Collection();
    this.events = new Collection();
    this.buttons = new Collection();
    this.selectMenus = new Collection();
    this.modals = new Collection();
    this.cooldowns = new Collection();
    this.db = null;
    this.commandsRegistered = false;
  }

  // ─────────────────────────────────────────────
  // START
  // ─────────────────────────────────────────────
  async start() {
    try {
      startupLog('Starting JackBot...');
      await new Promise(r => setTimeout(r, 1000));

      startupLog('Initializing database...');
      const dbInstance = await initializeDatabase();
      this.db = dbInstance.db;

      const dbStatus = this.db.getStatus();
      if (dbStatus.isDegraded) {
        logger.warn('⚠️ DATABASE RUNNING IN DEGRADED MODE');
      } else {
        startupLog(`Database OK: ${dbStatus.connectionType}`);
      }

      startupLog('Starting web server...');
      this.startWebServer();

      startupLog('Loading commands...');
      await loadCommands(this);
      startupLog(`Commands loaded: ${this.commands.size}`);

      startupLog('Loading handlers...');
      await this.loadHandlers();
      startupLog('Handlers loaded');

      startupLog('Logging into Discord...');
      await this.login(this.config.bot.token);
      startupLog('Discord login successful');

      this.once('clientReady', async () => {
        try {
          if (this.commandsRegistered) return;
          this.commandsRegistered = true;

          startupLog('Registering slash commands...');
          await this.registerCommands();
          startupLog('Slash commands registration complete');

          const handlerSummary =
            `${this.buttons.size} buttons, ${this.selectMenus.size} menus, ${this.modals.size} modals`;
          startupLog(`ONLINE ✅ | ${this.commands.size} commands loaded | ${handlerSummary}`);

          this.setupCronJobs();
        } catch (err) {
          logger.error('Command registration failed:', err);
        }
      });

    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  // ─────────────────────────────────────────────
  // COMMAND REGISTRATION
  // ─────────────────────────────────────────────
  async registerCommands() {
    try {
      const commands = [];
      for (const command of this.commands.values()) {
        if (command.data?.toJSON) commands.push(command.data.toJSON());
      }

      if (commands.length === 0) {
        logger.warn('No commands to register!');
        return;
      }

      const guildId = this.config.bot.guildId;

      // If a guild ID is provided, attempt guild‑scoped registration
      if (guildId) {
        logger.info(`Attempting guild registration for ${guildId}...`);
        try {
          const guild = await this.guilds.fetch(guildId);
          const registered = await guild.commands.set(commands);
          logger.info(`✅ Guild commands registered: ${registered.length} commands`);
        } catch (guildErr) {
          logger.error('Guild command registration failed – falling back to global:', guildErr);
          // Fall back to global registration if guild registration fails
          const registered = await this.application.commands.set(commands);
          logger.info(`✅ Global commands registered as fallback: ${registered.length} commands`);
        }
        // Ensure no stale global commands remain
        logger.info('Clearing any leftover global commands...');
        await this.application.commands.set([]);
        logger.info('✅ Global commands cleared');
      } else {
        // No guild ID – register globally
        logger.info(`Registering ${commands.length} global commands...`);
        const registered = await this.application.commands.set(commands);
        logger.info(`✅ Global commands registered: ${registered.length} commands`);
      }
    } catch (error) {
      logger.error('Error registering commands:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────
  async loadHandlers() {
    const handlers = [
      { path: 'events', required: true },
      { path: 'interactions', required: true },
    ];

    for (const handler of handlers) {
      try {
        const module = await import(`./handlers/${handler.path}.js`);
        const fn = module.default;
        if (typeof fn === 'function') {
          await fn(this);
          logger.info(`Loaded ${handler.path}`);
        }
      } catch (error) {
        logger.error(`Failed loading ${handler.path}:`, error);
        if (handler.required) throw error;
      }
    }
  }

  // ─────────────────────────────────────────────
  // WEB SERVER
  // ─────────────────────────────────────────────
  startWebServer() {
    const app = express();
    const port = this.config.api?.port || process.env.PORT || 3000;

    app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
    app.get('/ready', (req, res) => {
      if (this.isReady()) return res.json({ ready: true });
      res.status(503).json({ ready: false });
    });
    app.get('/', (req, res) => res.json({ message: 'JackBot Online', timestamp: new Date().toISOString() }));

    app.listen(port, '0.0.0.0', () => {
      startupLog(`Web server running on port ${port}`);
    });
  }

  // ─────────────────────────────────────────────
  // CRON JOBS
  // ─────────────────────────────────────────────
  setupCronJobs() {
    cron.schedule('0 6 * * *', () => checkBirthdays(this));
    cron.schedule('* * * * *', () => checkGiveaways(this));
    cron.schedule('*/15 * * * *', () => this.updateAllCounters());
  }

  // ─────────────────────────────────────────────
  // COUNTERS
  // ─────────────────────────────────────────────
  async updateAllCounters() {
    if (!this.db) return;
    for (const [guildId, guild] of this.guilds.cache) {
      try {
        const counters = await getServerCounters(this, guildId);
        const valid = [];
        const orphaned = [];
        for (const counter of counters) {
          const channel = guild.channels.cache.get(counter.channelId);
          if (channel) {
            valid.push(counter);
            await updateCounter(this, guild, counter);
          } else {
            orphaned.push(counter);
          }
        }
        if (orphaned.length) await saveServerCounters(this, guildId, valid);
      } catch (err) {
        logger.error(`Counter error ${guildId}:`, err);
      }
    }
  }

  // ─────────────────────────────────────────────
  // SHUTDOWN
  // ─────────────────────────────────────────────
  async shutdown(reason = 'UNKNOWN') {
    shutdownLog(`Shutting down (${reason})`);
    try {
      cron.getTasks().forEach(t => t.stop());
      if (this.db?.db?.pool) await this.db.db.pool.end();
      if (this.isReady()) this.destroy();
      shutdownLog('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Shutdown error:', error);
      process.exit(1);
    }
  }
}

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────
const bot = new TitanBot();

process.on('SIGINT', () => bot.shutdown('SIGINT'));
process.on('SIGTERM', () => bot.shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => logger.error('Uncaught Exception:', err));

bot.start();

export default TitanBot;