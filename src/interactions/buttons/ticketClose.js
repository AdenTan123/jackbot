import { AttachmentBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getGuildConfig } from '../../services/guildConfig.js';

async function generateTranscript(channel) {
  try {
    let allMessages = [];
    let lastId = null;

    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;
      const messages = await channel.messages.fetch(options);
      if (!messages.size) break;
      allMessages = allMessages.concat([...messages.values()]);
      lastId = messages.last()?.id;
      if (messages.size < 100) break;
    }

    allMessages.reverse();

    const lines = [
      `═══════════════════════════════════════`,
      `  TICKET TRANSCRIPT — #${channel.name}`,
      `  Category: ${channel.parent?.name ?? 'Unknown'}`,
      `  Created: ${channel.createdAt?.toUTCString() ?? 'Unknown'}`,
      `  Exported: ${new Date().toUTCString()}`,
      `  Total Messages: ${allMessages.length}`,
      `═══════════════════════════════════════`,
      '',
    ];

    for (const msg of allMessages) {
      const time = msg.createdAt.toUTCString();
      const author = `${msg.author.tag} (${msg.author.id})`;
      lines.push(`[${time}] ${author}`);
      if (msg.content) lines.push(`  ${msg.content}`);
      if (msg.embeds.length) {
        for (const embed of msg.embeds) {
          if (embed.title) lines.push(`  [Embed] ${embed.title}`);
          if (embed.description) lines.push(`  ${embed.description}`);
          for (const field of embed.fields ?? []) {
            lines.push(`  ${field.name}: ${field.value}`);
          }
        }
      }
      if (msg.attachments.size) {
        for (const att of msg.attachments.values()) {
          lines.push(`  [Attachment] ${att.name}: ${att.url}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  } catch (error) {
    logger.error('Failed to generate transcript:', error);
    return `Failed to generate transcript: ${error.message}`;
  }
}

export default {
  name: 'ticket_close',

  async execute(interaction, client, args) {
    try {
      const cfg = await getGuildConfig(client, interaction.guildId).catch(() => ({}));
      const categoryId = cfg?.ticketCategoryId ?? null;
      const logChannelId = cfg?.ticketLogChannelId ?? null;

      if (categoryId && interaction.channel.parentId !== categoryId) {
        return interaction.reply({
          embeds: [createEmbed({
            title: '❌ Not a Ticket',
            description: 'This button can only be used inside a ticket channel.',
            color: 'error',
            timestamp: true,
          })],
          ephemeral: true,
        });
      }

      const creatorId = args[0];
      const canClose =
        interaction.user.id === creatorId ||
        interaction.member.permissions.has('ManageChannels');

      if (!canClose) {
        return interaction.reply({
          embeds: [createEmbed({
            title: '❌ No Permission',
            description: 'Only the ticket creator or a moderator can close this ticket.',
            color: 'error',
            timestamp: true,
          })],
          ephemeral: true,
        });
      }

      await interaction.reply({
        embeds: [createEmbed({
          title: '🔒 Ticket Closing',
          description: `Ticket closed by <@${interaction.user.id}>.\nGenerating transcript and deleting in **5 seconds**.`,
          color: 'error',
          timestamp: true,
        })],
      });

      const transcriptText = await generateTranscript(interaction.channel);
      const transcriptFile = new AttachmentBuilder(
        Buffer.from(transcriptText, 'utf-8'),
        { name: `transcript-${interaction.channel.name}-${Date.now()}.txt` }
      );

      if (logChannelId) {
        try {
          const logChannel = interaction.guild.channels.cache.get(logChannelId);
          if (logChannel) {
            await logChannel.send({
              embeds: [createEmbed({
                title: '🔒 Ticket Closed',
                color: 'error',
                fields: [
                  { name: '📌 Channel', value: `#${interaction.channel.name}`, inline: true },
                  { name: '🔧 Closed by', value: `<@${interaction.user.id}>`, inline: true },
                  { name: '🕐 Closed at', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                ],
                footer: { text: 'Transcript attached below' },
                timestamp: true,
              })],
              files: [transcriptFile],
            });
          }
        } catch (err) {
          logger.error('Failed to log ticket close:', err);
        }
      }

      setTimeout(async () => {
        try {
          await interaction.channel.delete(`Ticket closed by ${interaction.user.tag}`);
        } catch (err) {
          logger.error('Failed to delete ticket channel from button:', err);
        }
      }, 5000);

    } catch (error) {
      logger.error('Ticket close button error:', error);
    }
  },
};