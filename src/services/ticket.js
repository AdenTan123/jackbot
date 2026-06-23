import {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
} from 'discord.js';
import { getTicketData, saveTicketData, deleteTicketData, getOpenTicketCountForUser, incrementTicketCounter } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { createEmbed, errorEmbed } from '../utils/embeds.js';
import { logTicketEvent } from '../utils/ticketLogging.js';
import { ensureTypedServiceError } from '../utils/serviceErrorBoundary.js';

// ─── Hardcoded Configurations ───
const TICKET_CATEGORY_ID = '1514526048430198895';
const TICKET_LOG_CHANNEL_ID = '1514528044801327147';
const TICKET_DELETE_DELAY_MS = 1000; // Fast delete delay

// Fallback Map since priority features are stripped but code structure requires the object reference
const PRIORITY_MAP = {
  none: { label: 'Standard', emoji: '🎫', color: '#3498db' }
};

export async function getUserTicketCount(guildId, userId) {
  try {
    return await getOpenTicketCountForUser(guildId, userId);
  } catch (error) {
    const typedError = ensureTypedServiceError(error, {
      service: 'ticketService',
      operation: 'getUserTicketCount',
      message: 'Ticket operation failed: getUserTicketCount',
      userMessage: 'Failed to count open tickets.',
      context: { guildId, userId }
    });
    logger.error('Error counting user tickets:', {
      guildId,
      userId,
      error: typedError.message,
    });
    return 0;
  }
}

export async function createTicket(guild, member, categoryId, reason = 'No reason provided', priority = 'none') {
  try {
    const targetCategory = TICKET_CATEGORY_ID;
    const currentTicketCount = await getUserTicketCount(guild.id, member.id);
    
    if (currentTicketCount >= 3) {
      return {
        success: false,
        error: `You have reached the maximum number of open tickets (3). Please close your existing tickets before creating a new one.`
      };
    }
    
    const category = guild.channels.cache.get(targetCategory);
    if (!category) {
      return { success: false, error: 'Configured ticket category was not found in this guild.' };
    }
    
    const ticketNumber = await getNextTicketNumber(guild.id);
    const channelName = `ticket-${ticketNumber}`;
    
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: targetCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });
    
    const ticketData = {
      id: channel.id,
      userId: member.id,
      guildId: guild.id,
      createdAt: new Date().toISOString(),
      status: 'open',
      claimedBy: null,
      priority: 'none',
      reason,
    };
    
    await saveTicketData(guild.id, channel.id, ticketData);
    
    const priorityInfo = PRIORITY_MAP.none;
    
    const embed = createEmbed({
      title: `Ticket #${ticketNumber}`,
      description: `${member.toString()}, thanks for creating a ticket!\n\n**Reason:** ${reason}`,
      color: priorityInfo.color,
      fields: [
        { name: 'Status', value: '🟢 Open', inline: true },
        { name: 'Claimed By', value: 'Not claimed', inline: true },
        { name: 'Created', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      ],
    });
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close & Delete Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒'),
      new ButtonBuilder()
        .setCustomId('ticket_claim')
        .setLabel('Claim')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🙋')
    );
    
    const messageContent = `${member.toString()}`;
    
    const ticketMessage = await channel.send({ 
      content: messageContent,
      embeds: [embed],
      components: [row] 
    });

    await ticketMessage.pin().catch(() => {});
    
    await logTicketEvent({
      client: guild.client,
      guildId: guild.id,
      event: {
        type: 'open',
        ticketId: channel.id,
        ticketNumber: ticketNumber,
        userId: member.id,
        executorId: member.id,
        reason: reason,
        priority: 'none',
        metadata: {
          channelId: channel.id,
          categoryName: category?.name || 'Tickets'
        }
      }
    });
    
    return { success: true, channel, ticketData };
    
  } catch (error) {
    const typedError = ensureTypedServiceError(error, {
      service: 'ticketService',
      operation: 'createTicket',
      message: 'Ticket operation failed: createTicket',
      userMessage: 'Failed to create ticket. Please try again in a moment.',
      context: { guildId: guild?.id, userId: member?.id }
    });
    logger.error('Error creating ticket:', {
      guildId: guild?.id,
      userId: member?.id,
      error: typedError.message,
    });
    return { 
      success: false, 
      error: typedError.userMessage || typedError.message,
    };
  }
}

export async function closeTicket(channel, closer, reason = 'No reason provided') {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }
    
    ticketData.status = 'closed';
    ticketData.closedBy = closer.id;
    ticketData.closedAt = new Date().toISOString();
    ticketData.closeReason = reason;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
    // Generate transcript and push straight to the hardcoded log channel before channel wipeout
    let attachment = null;
    try {
      attachment = await generateTranscript(channel);
    } catch (txErr) {
      logger.error('Failed transcript building:', txErr);
    }

    const logChannel = await channel.client.channels.fetch(TICKET_LOG_CHANNEL_ID).catch(() => null);
    if (logChannel && logChannel.isSendable()) {
      const logEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket Closed & Deleted')
        .setDescription(`Ticket channel **#${channel.name}** was processed.`)
        .setColor('#e74c3c')
        .addFields(
          { name: 'Ticket User ID', value: `\`${ticketData.userId}\``, inline: true },
          { name: 'Closed By', value: `${closer}`, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

      await logChannel.send({
        embeds: [logEmbed],
        ...(attachment ? { files: [attachment] } : {})
      }).catch(() => {});
    }

    // Fire log hooks
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'close',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: closer.id,
        reason: reason,
        metadata: { dmSent: false, closedAt: ticketData.closedAt }
      }
    });

    // Vaporize channel instantly
    setTimeout(async () => {
      await channel.delete('Ticket closed permanently').catch(() => {});
      await deleteTicketData(channel.guild.id, channel.id).catch(() => {});
    }, TICKET_DELETE_DELAY_MS);

    return { success: true, ticketData };
    
  } catch (error) {
    const typedError = ensureTypedServiceError(error, {
      service: 'ticketService',
      operation: 'closeTicket',
      message: 'Ticket operation failed: closeTicket',
      userMessage: 'Failed to close ticket.',
      context: { guildId: channel?.guild?.id, channelId: channel?.id }
    });
    return { success: false, error: typedError.message };
  }
}

export async function claimTicket(channel, claimer) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }
    
    if (ticketData.claimedBy) {
      return { success: false, error: `This ticket is already claimed by <@${ticketData.claimedBy}>` };
    }
    
    ticketData.claimedBy = claimer.id;
    ticketData.claimedAt = new Date().toISOString();
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => m.embeds.length > 0 && m.embeds[0].title?.startsWith('Ticket #'));
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const claimedField = embed.fields?.find(f => f.name === 'Claimed By');
      if (claimedField) claimedField.value = claimer.toString();
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claimed').setStyle(ButtonStyle.Secondary).setEmoji('🙋').setDisabled(true)
      );
      
      await ticketMessage.edit({ embeds: [embed], components: [row] });
    }
    
    const claimEmbed = createEmbed({
      title: 'Ticket Claimed',
      description: `🎉 ${claimer} has claimed this ticket!`,
      color: '#2ecc71'
    });
    
    await channel.send({ embeds: [claimEmbed] });
    return { success: true, ticketData };
  } catch (error) {
    return { success: false, error: 'Failed to claim ticket.' };
  }
}

async function generateTranscript(channel) {
  try {
    const messages = [];
    let before = undefined;
    let batch;
    do {
      batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (batch.size === 0) break;
      messages.push(...batch.values());
      before = batch.last()?.id;
    } while (batch.size === 100);

    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const escape = (str) => String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = messages.map((msg) => {
      const ts = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
      const author = escape(msg.author?.tag ?? msg.author?.username ?? 'Unknown');
      const content = escape(msg.content || (msg.embeds.length ? '[embed]' : '[attachment]'));
      return `<tr><td>${ts}</td><td>${author}</td><td>${content}</td></tr>`;
    }).join('\n');

    const html = `<html><body style="background:#36393f;color:#dcddde;font-family:sans-serif;padding:20px;"><h2>📜 Transcript - #${escape(channel.name)}</h2><table>${rows}</table></body></html>`;
    return new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: `transcript-${channel.id}.html` });
  } catch {
    return null;
  }
}

async function getNextTicketNumber(guildId) {
  return await incrementTicketCounter(guildId);
}

// Stubs for clean compatibility execution
export async function reopenTicket() { return { success: false, error: 'Feature disabled.' }; }
export async function unclaimTicket() { return { success: false, error: 'Feature disabled.' }; }
export async function updateTicketPriority() { return { success: false, error: 'Feature disabled.' }; }
export async function deleteTicket(channel, deleter) { return await closeTicket(channel, deleter); }