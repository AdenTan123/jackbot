import { Events, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ChannelType } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../services/guildConfig.js';
import { logger } from '../utils/logger.js';

// Internal formatting validation rules processor
function checkSubmissionRules(type, content, attachment) {
  if (type === 'attachment' && !attachment) {
    return "⚠️ This server's competition rules require an attached file or image submission.";
  }
  if (type === 'link' && (!content || !/https?:\/\/[^\s]+/.test(content))) {
    return "⚠️ This server's competition rules require your entry message to contain a valid URL Link (e.g., https://...).";
  }
  if (type === 'message' && (!content || content.trim().length === 0)) {
    return "⚠️ This server's competition rules require a written text message entry.";
  }
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
        if (!client.tempSubmissions) {
          client.tempSubmissions = new Map();
        }

        const activeGuildsForUser = [];
        const guilds = client.guilds.cache;

        // Loop across mutual servers to map active configurations matching user profile
        for (const [guildId, guild] of guilds) {
          const isMember = await guild.members.fetch(message.author.id).catch(() => null);
          if (!isMember) continue;

          const cfg = await getGuildConfig(client, guildId).catch(() => null);
          if (cfg?.competition?.active) {
            activeGuildsForUser.push({
              id: guildId,
              name: guild.name,
              config: cfg.competition
            });
          }
        }

        if (activeGuildsForUser.length === 0) {
          return await message.reply("❌ There are currently no active competitions accepting submissions in servers you share with the bot.");
        }

        // Cache runtime elements safely
        const attachmentUrl = message.attachments.first()?.url || null;
        client.tempSubmissions.set(message.author.id, {
          content: message.content,
          attachmentUrl: attachmentUrl,
          timestamp: Date.now()
        });

        // CONDITION A: Multiple mutual entries found -> Dispatch select menu
        if (activeGuildsForUser.length > 1) {
          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('competition_guild_select')
            .setPlaceholder('Select the destination server...');

          activeGuildsForUser.forEach(g => {
            selectMenu.addOptions(
              new StringSelectMenuOptionBuilder()
                .setLabel(g.name)
                .setValue(g.id)
                .setDescription(`Submit entry to ${g.name}`)
            );
          });

          const row = new ActionRowBuilder().addComponents(selectMenu);
          return await message.reply({
            content: "👋 **Multiple active competitions detected!** Please pick the target server you are submitting this entry to from the menu selection below:",
            components: [row]
          });
        }

        // CONDITION B: Exactly 1 matching active server found -> Process automatically
        const singleTarget = activeGuildsForUser[0];
        const compConfig = singleTarget.config;

        const ruleViolation = checkSubmissionRules(compConfig.eventType, message.content, attachmentUrl);
        if (ruleViolation) {
          return await message.reply(ruleViolation);
        }

        const currentEntries = compConfig.submissions?.[message.author.id] || 0;
        if (currentEntries >= (compConfig.maxSubmissions || 1)) {
          return await message.reply(`❌ **Submission Limit Reached:** You have already submitted the maximum allowed entries (${currentEntries}/${compConfig.maxSubmissions || 1}) for **${singleTarget.name}**.`);
        }

        let targetId = compConfig.categoryId || compConfig.category;
        let targetChannel = await client.channels.fetch(targetId).catch(() => null);

        if (!targetChannel) {
          return await message.reply("❌ The logging target channel is misconfigured inside that server. Please contact an Administrator.");
        }

        if (targetChannel.type === ChannelType.GuildCategory || !targetChannel.send) {
          const textInside = targetChannel.guild?.channels.cache.find(ch => ch.parentId === targetChannel.id && ch.isTextBased());
          if (textInside) targetChannel = textInside;
        }

        const submissionEmbed = new EmbedBuilder()
          .setColor('#00FF66')
          .setTitle(`📥 Competition Submission | ${singleTarget.name}`)
          .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setDescription(`**User:** <@${message.author.id}> (${message.author.id})\n\n**Content:**\n${message.content || '*No text message content provided.*'}`)
          .setTimestamp();

        if (attachmentUrl) submissionEmbed.setImage(attachmentUrl);

        await targetChannel.send({ embeds: [submissionEmbed] });

        compConfig.submissions = compConfig.submissions || {};
        compConfig.submissions[message.author.id] = currentEntries + 1;
        
        const fullConfig = await getGuildConfig(client, singleTarget.id).catch(() => ({}));
        fullConfig.competition = compConfig;
        await updateGuildConfig(client, singleTarget.id, fullConfig);

        client.tempSubmissions.delete(message.author.id);
        return await message.reply(`✅ **Submission Logged successfully to ${singleTarget.name}!** (${currentEntries + 1}/${compConfig.maxSubmissions || 1})`);

      } catch (err) {
        logger.error('DM Router exception caught:', err);
        return await message.reply("❌ An unexpected tracking error disrupted your submission context.");
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
        if (cfg.counting.deleteNonWords) {
          await message.delete().catch(() => null);
        }
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
        await message.channel.send(`❌ **${message.author.username}** ruined the count! You cannot count twice in a row. Next number is **1**.`);
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
        await message.channel.send(`❌ **${message.author.username}** ruined the count! They said **${content}** instead of **${nextNumber}**. Next number is **1**.`);
      }
    } catch (error) {
      logger.error('Error handling counting game processing:', error);
    }
  }
};