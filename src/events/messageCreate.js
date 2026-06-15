import { Events } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../services/guildConfig.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageCreate,

  async execute(message, client) {
    // Ignore direct messages, other bots, or system messages
    if (!message.guild || message.author.bot || message.system) return;

    try {
      // 1. Fetch the server's configuration
      const cfg = await getGuildConfig(client, message.guildId).catch(() => null);
      
      // If counting isn't configured, or this isn't the assigned counting channel, do nothing
      if (!cfg?.counting || message.channel.id !== cfg.counting.channelId) return;

      const content = message.content.trim();
      let currentCount = NaN;

      // 2. Parse the number from the message based on your rules
      if (/^[0-9]+$/.test(content)) {
        currentCount = parseInt(content, 10);
      } else if (cfg.counting.allowMath && /^[0-9+\-*/().\s]+$/.test(content)) {
        try {
          // Safely evaluate simple arithmetic expressions (e.g., "4+1") without full eval strings
          currentCount = Function(`"use strict"; return (${content})`)();
        } catch {
          currentCount = NaN;
        }
      }

      // 3. Handle messages that aren't valid numbers/math expressions
      if (isNaN(currentCount)) {
        if (cfg.counting.deleteNonWords) {
          await message.delete().catch(() => null);
        }
        return; // Skip processing game rules for normal chatter if deleteNonWords is turned off
      }

      // Initialize runtime state if they are missing
      const lastNumber = cfg.counting.lastNumber ?? 0;
      const lastUserId = cfg.counting.lastUserId ?? null;
      const nextNumber = lastNumber + 1;

      // 4. RULE: You can't count twice in a row
      if (message.author.id === lastUserId) {
        await message.react('❌').catch(() => null);
        
        cfg.counting.lastNumber = 0;
        cfg.counting.lastUserId = null;
        await updateGuildConfig(client, message.guildId, cfg);

        await message.channel.send(`❌ **${message.author.username}** ruined the count! You cannot count twice in a row. Next number is **1**.`);
        return;
      }

      // 5. RULE: Check if it's the right number
      if (currentCount === nextNumber) {
        // SUCCESS ✅
        await message.react('✅').catch(() => null);
        
        cfg.counting.lastNumber = nextNumber;
        cfg.counting.lastUserId = message.author.id;
        await updateGuildConfig(client, message.guildId, cfg);
      } else {
        // RUINED ❌
        await message.react('❌').catch(() => null);
        
        cfg.counting.lastNumber = 0;
        cfg.counting.lastUserId = null;
        await updateGuildConfig(client, message.guildId, cfg);

        await message.channel.send(`❌ **${message.author.username}** ruined the count! They said **${content}** instead of **${nextNumber}**. Next number is **1**.`);
      }

    } catch (error) {
      logger.error('Error handling counting game message processing:', error);
    }
  },
};