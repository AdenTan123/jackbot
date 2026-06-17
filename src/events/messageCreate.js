import { Events, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../services/guildConfig.js';

// 🔥 Ensure this import matches your database.js exports
import { setInDb } from '../utils/database.js'; 

import { logger } from '../utils/logger.js';

function checkSubmissionRules(type, content, attachment) {
  if (type === 'attachment' && !attachment) return "⚠️ This server's competition rules require an attached file or image submission.";
  if (type === 'link' && (!content || !/https?:\/\/[^\s]+/.test(content))) return "⚠️ This server's competition rules require your entry message to contain a valid URL Link (e.g., https://...).";
  if (type === 'message' && (!content || content.trim().length === 0)) return "⚠️ This server's competition rules require a written text message entry.";
  return null;
}

export default {
  name: Events.MessageCreate,

  async execute(message, client) {
    if (message.author.bot || message.system) return;

    // =========================================================================
    // 📬 PATH A: DIRECT MESSAGES (Adaptive Multi-Guild Routing)
    // =========================================================================
    if (!message.guild) {
      try {
        if (!client.tempSubmissions) client.tempSubmissions = new Map();

        const activeGuildsForUser = [];
        
        // Loop guilds
        for (const guild of client.guilds.cache.values()) {
          const cfg = await getGuildConfig(client, guild.id).catch(() => null);
          if (!cfg?.competition?.active) continue;

          const isMember = guild.members.cache.has(message.author.id) || await guild.members.fetch(message.author.id).catch(() => null);
          if (isMember) {
            activeGuildsForUser.push({ id: guild.id, name: guild.name, config: cfg.competition });
          }
        }

        if (activeGuildsForUser.length === 0) return await message.reply("❌ No active competitions found.");

        const attachmentUrl = message.attachments.first()?.url || null;
        client.tempSubmissions.set(message.author.id, { content: message.content, attachmentUrl, timestamp: Date.now() });

        // Handle Multiple Guilds
        if (activeGuildsForUser.length > 1) {
          const selectMenu = new StringSelectMenuBuilder().setCustomId('competition_guild_select').setPlaceholder('Select the destination server...');
          activeGuildsForUser.forEach(g => {
            selectMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(g.name).setValue(g.id).setDescription(`Submit entry to ${g.name}`));
          });
          return await message.reply({ content: "👋 **Multiple competitions detected!** Select the server:", components: [new ActionRowBuilder().addComponents(selectMenu)] });
        }

        // Handle Single Guild
        const singleTarget = activeGuildsForUser[0];
        const compConfig = singleTarget.config;
        const ruleViolation = checkSubmissionRules(compConfig.eventType, message.content, attachmentUrl);
        if (ruleViolation) return await message.reply(ruleViolation);

        // Check if already submitted (Enforce 1)
        if (compConfig.submissions?.[message.author.id]) {
          await setInDb(`competition_pending:${singleTarget.id}:${message.author.id}`, { content: message.content, url: attachmentUrl || message.content });
          const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`competition_replace:yes:${singleTarget.id}:${message.author.id}`).setLabel('Yes, Replace It').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`competition_replace:no:${singleTarget.id}:${message.author.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
          );
          return await message.reply({ content: `⚠️ **Submission Limit Reached:** You already have an entry in **${singleTarget.name}**. Replace it?`, components: [buttons] });
        }

        // Process Submission
        let targetChannel = await client.channels.fetch(compConfig.categoryId || compConfig.category).catch(() => null);
        const embed = new EmbedBuilder().setTitle(`📥 Submission | ${singleTarget.name}`).setDescription(message.content || 'No text').setImage(attachmentUrl);
        const sent = await targetChannel.send({ embeds: [embed] });

        compConfig.submissions = compConfig.submissions || {};
        compConfig.submissions[message.author.id] = { channelId: targetChannel.id, messageId: sent.id, url: attachmentUrl || message.content };
        
        const fullConfig = await getGuildConfig(client, singleTarget.id);
        fullConfig.competition = compConfig;
        await updateGuildConfig(client, singleTarget.id, fullConfig);

        client.tempSubmissions.delete(message.author.id);
        return await message.reply(`✅ **Submission Logged to ${singleTarget.name}!**`);

      } catch (err) {
        logger.error('DM Router exception:', err);
        return await message.reply("❌ An unexpected error occurred.");
      }
    }

    // =========================================================================
    // 🎲 PATH B: SERVER CONTEXT (Counting Game Logic)
    // =========================================================================
    try {
      const cfg = await getGuildConfig(client, message.guildId).catch(() => null);
      if (!cfg?.counting || message.channel.id !== cfg.counting.channelId) return;

      const content = message.content.trim();
      let currentCount = NaN;

      if (/^[0-9]+$/.test(content)) {
        currentCount = parseInt(content, 10);
      } else if (cfg.counting.allowMath && /^[0-9+\-*/().\s]+$/.test(content)) {
        try {
          currentCount = Function(`"use strict"; return (${content})`)();
        } catch {
          currentCount = NaN;
        }
      }

      if (isNaN(currentCount)) {
        if (cfg.counting.deleteNonWords) await message.delete().catch(() => null);
        return;
      }

      const lastNumber = cfg.counting.lastNumber ?? 0;
      const lastUserId = cfg.counting.lastUserId ?? null;
      const nextNumber = lastNumber + 1;

      if (message.author.id === lastUserId) {
        await message.react('❌').catch(() => null);
        cfg.counting.lastNumber = 0;
        cfg.counting.lastUserId = null;
        await updateGuildConfig(client, message.guildId, cfg);
        await message.channel.send(`❌ **${message.author.username}** ruined the count! No double counting. Next is **1**.`);
        return;
      }

      if (currentCount === nextNumber) {
        await message.react('✅').catch(() => null);
        cfg.counting.lastNumber = nextNumber;
        cfg.counting.lastUserId = message.author.id;
        await updateGuildConfig(client, message.guildId, cfg);
      } else {
        await message.react('❌').catch(() => null);
        cfg.counting.lastNumber = 0;
        cfg.counting.lastUserId = null;
        await updateGuildConfig(client, message.guildId, cfg);
        await message.channel.send(`❌ **${message.author.username}** ruined the count! They said **${content}** instead of **${nextNumber}**. Next is **1**.`);
      }
    } catch (error) {
      logger.error('Counting error:', error);
    }
  }
};