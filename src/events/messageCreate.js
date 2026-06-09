




import { Events, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling.js';
import { getGuildConfig, updateGuildConfig } from '../services/guildConfig.js';
import { getFromDb, setInDb, deleteFromDb } from '../utils/database.js';
import { addXp } from '../services/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;

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

      await handleLeveling(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};








async function handleLeveling(message, client) {
  try {
    const rateLimitKey = `xp-event:${message.guild.id}:${message.author.id}`;
    const canProcess = await checkRateLimit(rateLimitKey, MESSAGE_XP_RATE_LIMIT_ATTEMPTS, MESSAGE_XP_RATE_LIMIT_WINDOW_MS);
    if (!canProcess) {
      return;
    }

    const levelingConfig = await getLevelingConfig(client, message.guild.id);
    
    if (!levelingConfig?.enabled) {
      return;
    }

    
    if (levelingConfig.ignoredChannels?.includes(message.channel.id)) {
      return;
    }

    
    if (levelingConfig.ignoredRoles?.length > 0) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => {
        return null;
      });
      if (member && member.roles.cache.some(role => levelingConfig.ignoredRoles.includes(role.id))) {
        return;
      }
    }

    
    if (levelingConfig.blacklistedUsers?.includes(message.author.id)) {
      return;
    }

    
    if (!message.content || message.content.trim().length === 0) {
      return;
    }

    const userData = await getUserLevelData(client, message.guild.id, message.author.id);
    
    
    const cooldownTime = levelingConfig.xpCooldown || 60;
    const now = Date.now();
    const timeSinceLastMessage = now - (userData.lastMessage || 0);
    
    
    if (timeSinceLastMessage < cooldownTime * 1000) {
      return;
    }

    
    const minXP = levelingConfig.xpRange?.min || levelingConfig.xpPerMessage?.min || 15;
    const maxXP = levelingConfig.xpRange?.max || levelingConfig.xpPerMessage?.max || 25;

    
    const safeMinXP = Math.max(1, minXP);
    const safeMaxXP = Math.max(safeMinXP, maxXP);

    
    const xpToGive = Math.floor(Math.random() * (safeMaxXP - safeMinXP + 1)) + safeMinXP;

    
    let finalXP = xpToGive;
    if (levelingConfig.xpMultiplier && levelingConfig.xpMultiplier > 1) {
      finalXP = Math.floor(finalXP * levelingConfig.xpMultiplier);
    }

    
    const result = await addXp(client, message.guild, message.member, finalXP);
    
    if (result.success && result.leveledUp) {
      logger.info(
        `${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`
      );
    }
  } catch (error) {
    logger.error('Error handling leveling for message:', error);
  }
}

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


