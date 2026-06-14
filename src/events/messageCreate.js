import { Events, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, updateGuildConfig } from '../services/guildConfig.js';
import { setInDb } from '../utils/database.js';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot) return;

      if (!message.guild) {
        // Direct message -> check for competition submissions
        await handleDMSubmission(message, client);
        return;
      }

      // Handle counting game
      const messageDeleted = await handleCounting(message, client);
      
      // If the counting game deleted a non-number message, stop right here
      if (messageDeleted) return;

      // Add any other message features here in the future!

    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};


// ==========================================
// 🔢 COUNTING GAME LOGIC
// ==========================================
async function handleCounting(message, client) {
  try {
    const config = await getGuildConfig(client, message.guild.id).catch(() => null);
    const countingConfig = config?.counting;

    // Check if counting is configured and if we are in the correct channel
    if (!countingConfig || message.channel.id !== countingConfig.channelId) {
      return false; // Not a counting message, proceed normally
    }

    const content = message.content.trim();
    let parsedNumber = null;

    // Parse the message (handle normal numbers or math)
    if (countingConfig.allowMath) {
      const sanitized = content.replace(/[^-()\d/*+.]/g, '');
      if (sanitized === content.replace(/\s+/g, '')) {
        try { parsedNumber = Function(`'use strict'; return (${sanitized})`)(); } 
        catch (e) { parsedNumber = null; }
      }
    } else {
      if (/^-?\d+$/.test(content)) parsedNumber = parseInt(content, 10);
    }

    // Handle invalid/non-number messages
    if (parsedNumber === null || isNaN(parsedNumber)) {
      if (countingConfig.deleteNonWords) {
        await message.delete().catch(() => {});
        return true; // Return true to tell execute() the message was deleted
      }
      return false; 
    }

    const currentCount = countingConfig.lastNumber || 0;
    const expectedNumber = currentCount + 1;

    // Check for failure conditions (wrong number OR counting twice in a row)
    if (parsedNumber !== expectedNumber || message.author.id === countingConfig.lastUserId) {
      await message.react('❌').catch(() => {});
      await message.channel.send(`<@${message.author.id}> RUINED IT AT **${currentCount}**!!! Game has been restarted to 0.`);

      // Reset the config
      countingConfig.lastNumber = 0;
      countingConfig.lastUserId = null;
      await updateGuildConfig(client, message.guild.id, { counting: countingConfig });
      return false;
    }

    // Success! User counted correctly
    await message.react('✅').catch(() => {});
    
    // Update and save the new count state
    countingConfig.lastNumber = expectedNumber;
    countingConfig.lastUserId = message.author.id;
    await updateGuildConfig(client, message.guild.id, { counting: countingConfig });
    return false;

  } catch (err) {
    logger.error('Counting system error:', err);
    return false;
  }
}


// ==========================================
// 📨 DM SUBMISSION LOGIC
// ==========================================
async function handleDMSubmission(message, client) {
  try {
    // find guilds with active competition
    for (const guild of client.guilds.cache.values()) {
      const cfg = await getGuildConfig(client, guild.id).catch(() => ({}));
      const comp = cfg.competition;
      if (!comp || !comp.active) continue;

      // Only accept attachments
      if (!message.attachments || message.attachments.size === 0) {
        await message.reply({ embeds: [ { title: 'Submission Denied', description: 'Please include an image attachment to submit.', color: 0xFF0000 } ] }).catch(() => {});
        continue;
      }

      const attachment = message.attachments.first();
      const name = attachment.name || '';
      const isImage = (attachment.contentType && attachment.contentType.startsWith('image')) || /\.(png|jpe?g|gif|webp)$/i.test(name);
      if (!isImage) {
        await message.reply({ embeds: [ { title: 'Submission Denied', description: 'Attachment must be an image.', color: 0xFF0000 } ] }).catch(() => {});
        continue;
      }

      const submissions = comp.submissions || {};
      const userId = message.author.id;

      if (!submissions[userId]) {
        // create channel in configured category
        const categoryId = comp.categoryId || '1513833221832572989';
        const safeName = `${message.author.username}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 90) || `user-${userId}`;
        const channel = await guild.channels.create({ name: safeName, type: ChannelType.GuildText, parent: categoryId }).catch(err => {
          logger.warn('Failed to create competition channel:', err?.message || err);
          return null;
        });

        if (!channel) {
          await message.reply({ embeds: [ { title: 'Submission Failed', description: 'Could not create submission channel. Contact an admin.', color: 0xFF0000 } ] }).catch(() => {});
          continue;
        }

        // send the image into the channel
        const sent = await channel.send({ files: [attachment.url], content: `Submission from <@${userId}>` }).catch(err => {
          logger.warn('Failed to post submission in channel:', err?.message || err);
          return null;
        });

        submissions[userId] = { channelId: channel.id, messageId: sent?.id || null, url: attachment.url };
        comp.submissions = submissions;
        await updateGuildConfig(client, guild.id, { competition: comp }).catch(() => {});

        await message.reply({ embeds: [ { title: 'Submitted!', description: 'Your submission has been received.', color: 0x2ECC71 } ] }).catch(() => {});
        continue;
      }

      // existing submission -> ask to replace
      const pendingKey = `competition_pending:${guild.id}:${userId}`;
      await setInDb(pendingKey, { url: attachment.url, name: attachment.name || null });

      const yesId = `competition_replace:yes:${guild.id}:${userId}`;
      const noId = `competition_replace:no:${guild.id}:${userId}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(yesId).setLabel('Yes').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(noId).setLabel('No').setStyle(ButtonStyle.Danger)
      );

      await message.reply({ content: 'You already have a submission. Replace your previous submission with this one?', components: [row] }).catch(() => {});
      continue;
    }
  } catch (error) {
    logger.error('Error handling DM submission:', error);
  }
}