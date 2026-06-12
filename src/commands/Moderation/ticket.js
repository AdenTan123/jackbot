import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';

async function getTicketConfig(client, guildId) {
  const cfg = await getGuildConfig(client, guildId).catch(() => ({}));
  return {
    categoryId: cfg?.ticketCategoryId ?? null,
    logChannelId: cfg?.ticketLogChannelId ?? null,
  };
}

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

async function logToChannel(guild, logChannelId, embed, file = null) {
  if (!logChannelId) return;
  try {
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) {
      logger.warn(`Log channel ${logChannelId} not found in guild ${guild.id}`);
      return;
    }
    const payload = { embeds: [embed] };
    if (file) payload.files = [file];
    await logChannel.send(payload);
  } catch (error) {
    logger.error('Failed to log ticket action:', error);
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket management')
    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Configure ticket settings for this server')
      .addChannelOption(o => o.setName('category').setDescription('Category to create tickets under').setRequired(true))
      .addChannelOption(o => o.setName('log_channel').setDescription('Channel to log ticket actions').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a ticket for a user or role')
      .addUserOption(o => o.setName('user').setDescription('User to add to the ticket').setRequired(false))
      .addRoleOption(o => o.setName('role').setDescription('Role to add to the ticket (adds all role members)').setRequired(false))
      .addUserOption(o => o.setName('creator').setDescription('Person assigned to the ticket').setRequired(false))
      .addStringOption(o => o.setName('reason').setDescription('Reason for the ticket').setRequired(false)))
    .addSubcommand(sub => sub
      .setName('bring')
      .setDescription('Add a user to this ticket')
      .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a user from this ticket')
      .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('delete')
      .setDescription('Delete this ticket channel'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  category: 'moderation',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    const sub = interaction.options.getSubcommand();

    try {

      // ═══════════════════════════════════════════════════════════
      // SETUP
      // ═══════════════════════════════════════════════════════════
      if (sub === 'setup') {
        const category = interaction.options.getChannel('category');
        const logChannel = interaction.options.getChannel('log_channel');

        if (category.type !== ChannelType.GuildCategory) {
          throw new Error('The category option must be a category channel, not a text channel.');
        }

        await updateGuildConfig(client, interaction.guildId, {
          ticketCategoryId: category.id,
          ticketLogChannelId: logChannel.id,
        });

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({
            title: '✅ Ticket System Configured',
            color: 'success',
            fields: [
              { name: '📁 Category', value: category.name, inline: true },
              { name: '📋 Log Channel', value: `<#${logChannel.id}>`, inline: true },
            ],
            footer: { text: 'You can now use /ticket create' },
            timestamp: true,
          })],
        });
      }

      // Load per-guild config for all other subcommands
      const { categoryId, logChannelId } = await getTicketConfig(client, interaction.guildId);

      // ═══════════════════════════════════════════════════════════
      // CREATE
      // ═══════════════════════════════════════════════════════════
      if (sub === 'create') {
        if (!categoryId) {
          throw new Error('Tickets are not set up yet. Run `/ticket setup` first.');
        }

        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');

        if (!user && !role) {
          throw new Error('You must provide either a user or a role.');
        }

        const creator = interaction.options.getUser('creator') || interaction.user;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const category = interaction.guild.channels.cache.get(categoryId);
        if (!category) {
          throw new Error('Ticket category not found. Please run `/ticket setup` again.');
        }

        // Build channel name
        const ticketName = user
          ? `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)}`
          : `ticket-${role.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)}`;

        // Build permission overwrites
        const overwrites = [
          {
            id: interaction.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: creator.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
          {
            id: client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
          },
        ];

        // If user provided, give them access individually
        if (user) {
          overwrites.push({
            id: user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          });
        }

        // If role provided, give the ROLE access (so all role members can see)
        if (role) {
          overwrites.push({
            id: role.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          });
        }

        // Create the channel
        const ticketChannel = await interaction.guild.channels.create({
          name: ticketName,
          type: ChannelType.GuildText,
          parent: categoryId,
          permissionOverwrites: overwrites,
        });

        // Build target mention string
        const target = user ? `<@${user.id}>` : `<@&${role.id}>`;

        // Build embed description
        const embedDescription = user
          ? `This is a personal ticket for <@${user.id}> with <@${creator.id}>`
          : `This is a role ticket for <@&${role.id}> created by <@${creator.id}>`;

        const embed = createEmbed({
          title: '🎫 Personal Ticket',
          description: embedDescription,
          color: 'info',
          fields: [
            { name: user ? '👤 User' : '🎭 Role', value: target, inline: true },
            { name: '🙋 Created by', value: `<@${creator.id}>`, inline: true },
            { name: '📝 Reason', value: reason, inline: false },
          ],
          footer: { text: `Ticket created by ${interaction.user.tag}` },
          timestamp: true,
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_close:${creator.id}`)
            .setLabel('🔒 Close Ticket')
            .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({
          content: target,
          embeds: [embed],
          components: [row],
        });

        // Log to log channel
        await logToChannel(interaction.guild, logChannelId, createEmbed({
          title: '🎫 Ticket Created',
          color: 'info',
          fields: [
            { name: '📌 Channel', value: `<#${ticketChannel.id}>`, inline: true },
            { name: user ? '👤 User' : '🎭 Role', value: target, inline: true },
            { name: '🙋 Creator', value: `<@${creator.id}>`, inline: true },
            { name: '📝 Reason', value: reason, inline: false },
            { name: '🔧 Created by', value: `<@${interaction.user.id}>`, inline: true },
          ],
          timestamp: true,
        }));

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            `Ticket created: <#${ticketChannel.id}>`,
            '✅ Ticket Created'
          )],
        });
      }

      // ═══════════════════════════════════════════════════════════
      // BRING
      // ═══════════════════════════════════════════════════════════
      else if (sub === 'bring') {
        if (interaction.channel.parentId !== categoryId) {
          throw new Error('This command can only be used inside a ticket channel.');
        }

        const user = interaction.options.getUser('user');

        await interaction.channel.permissionOverwrites.create(user.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });

        await interaction.channel.send({
          content: `<@${user.id}>`,
          embeds: [createEmbed({
            title: '➕ User Added',
            description: `<@${user.id}> has been added to this ticket by <@${interaction.user.id}>.`,
            color: 'info',
            timestamp: true,
          })],
        });

        await logToChannel(interaction.guild, logChannelId, createEmbed({
          title: '➕ User Added to Ticket',
          color: 'info',
          fields: [
            { name: '📌 Channel', value: `<#${interaction.channel.id}>`, inline: true },
            { name: '👤 User Added', value: `<@${user.id}>`, inline: true },
            { name: '🔧 By', value: `<@${interaction.user.id}>`, inline: true },
          ],
          timestamp: true,
        }));

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`<@${user.id}> has been added to the ticket.`, '✅ User Added')],
        });
      }

      // ═══════════════════════════════════════════════════════════
      // REMOVE
      // ═══════════════════════════════════════════════════════════
      else if (sub === 'remove') {
        if (interaction.channel.parentId !== categoryId) {
          throw new Error('This command can only be used inside a ticket channel.');
        }

        const user = interaction.options.getUser('user');

        // Revoke all permissions for this user
        await interaction.channel.permissionOverwrites.create(user.id, {
          ViewChannel: false,
          SendMessages: false,
          ReadMessageHistory: false,
          AddReactions: false,
          AttachFiles: false,
          EmbedLinks: false,
        });

        // Optional: also kick them from the channel's permission list entirely
        try {
          await interaction.channel.permissionOverwrites.delete(user.id);
        } catch {
          // If permission overwrite doesn't exist, that's fine
        }

        await interaction.channel.send({
          embeds: [createEmbed({
            title: '➖ User Removed',
            description: `<@${user.id}> has been removed from this ticket by <@${interaction.user.id}>.`,
            color: 'warning',
            timestamp: true,
          })],
        });

        await logToChannel(interaction.guild, logChannelId, createEmbed({
          title: '➖ User Removed from Ticket',
          color: 'warning',
          fields: [
            { name: '📌 Channel', value: `<#${interaction.channel.id}>`, inline: true },
            { name: '👤 User Removed', value: `<@${user.id}>`, inline: true },
            { name: '🔧 By', value: `<@${interaction.user.id}>`, inline: true },
          ],
          timestamp: true,
        }));

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`<@${user.id}> has been removed from the ticket.`, '✅ User Removed')],
        });
      }

      // ═══════════════════════════════════════════════════════════
      // DELETE
      // ═══════════════════════════════════════════════════════════
      else if (sub === 'delete') {
        if (interaction.channel.parentId !== categoryId) {
          throw new Error('This command can only be used inside a ticket channel.');
        }

        await interaction.channel.send({
          embeds: [createEmbed({
            title: '🗑️ Ticket Closing',
            description: `This ticket is being deleted by <@${interaction.user.id}>.\nGenerating transcript and deleting in **5 seconds**.`,
            color: 'error',
            timestamp: true,
          })],
        });

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Transcript will be saved and ticket deleted in 5 seconds.', '🗑️ Deleting Ticket')],
        });

        const transcriptText = await generateTranscript(interaction.channel);
        const transcriptFile = new AttachmentBuilder(
          Buffer.from(transcriptText, 'utf-8'),
          { name: `transcript-${interaction.channel.name}-${Date.now()}.txt` }
        );

        await logToChannel(interaction.guild, logChannelId, createEmbed({
          title: '🗑️ Ticket Deleted',
          color: 'error',
          fields: [
            { name: '📌 Channel', value: `#${interaction.channel.name}`, inline: true },
            { name: '🔧 Deleted by', value: `<@${interaction.user.id}>`, inline: true },
            { name: '🕐 Deleted at', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
          ],
          footer: { text: 'Transcript attached below' },
          timestamp: true,
        }), transcriptFile);

        setTimeout(async () => {
          try {
            await interaction.channel.delete(`Ticket deleted by ${interaction.user.tag}`);
          } catch (err) {
            logger.error('Failed to delete ticket channel:', err);
          }
        }, 5000);
      }

    } catch (error) {
      logger.error('Ticket command error:', error);
      await handleInteractionError(interaction, error, { subtype: `ticket_${sub}_failed` });
    }
  },
};