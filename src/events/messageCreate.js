import { Events, EmbedBuilder } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../services/guildConfig.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageCreate,

  async execute(message, client) {
    // Global guard: ignore other bots or system messages
    if (message.author.bot || message.system) return;

    // =========================================================================
    // 📬 PATH A: HANDLE DIRECT MESSAGES (Competition Submissions)
    // =========================================================================
    if (!message.guild) {
      try {
        let activeGuildId = null;
        let compConfig = null;

        // 1. Scan the servers the bot is in to find where a contest is active
        const guilds = client.guilds.cache;
        for (const [guildId, guild] of guilds) {
          // Optimization: Verify the user is actually a member of that server
          const isMember = await guild.members.fetch(message.author.id).catch(() => null);
          if (!isMember) continue;

          const cfg = await getGuildConfig(client, guildId).catch(() => null);
          if (cfg?.competition?.active) {
            activeGuildId = guildId;
            compConfig = cfg.competition;
            break; 
          }
        }

        // If no server has an active competition running, notify them gently
        if (!compConfig) {
          return await message.reply("❌ There are currently no active competitions accepting entries right now.");
        }

        // 2. Validation: Ensure they actually sent an image submission
        if (message.attachments.size === 0) {
          return await message.reply("⚠️ Please upload an image or submission file along with your message to enter the competition!");
        }

        // 3. Locate the target logging channel set by your /competition command
        const targetChannelId = compConfig.categoryId || compConfig.category;
        const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);

        if (!targetChannel) {
          logger.error(`Competition Submission Error: Channel/Category ID ${targetChannelId} could not be resolved.`);
          return await message.reply("❌ The competition submission channel is misconfigured on the server. Please notify an Administrator.");
        }

        // 4. Wrap up the entry and route it straight to your staff channel
        const entryAttachment = message.attachments.first();
        const submissionEmbed = new EmbedBuilder()
          .setColor('#00FF66')
          .setTitle('📥 New Competition Submission Received')
          .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setDescription(`**Submitting User:** <@${message.author.id}> (${message.author.id})\n\n**Caption/Message:**\n${message.content || '*No context text provided.*'}`)
          .setImage(entryAttachment.url)
          .setTimestamp();

        await targetChannel.send({ embeds: [submissionEmbed] });

        return await message.reply("✅ **Submission Successful!** Your entry has been logged and forwarded to the competition review board. Good luck!");

      } catch (dmError) {
        logger.error('Error handling DM competition entry processing:', dmError);
        return await message.reply("❌ An unexpected error disrupted your submission process. Please try again shortly.");
      }
    }

    // =========================================================================
    // 🎲 PATH B: HANDLE SERVER MESSAGES (Counting Game Context)
    // =========================================================================
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