import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChannelType, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  MessageFlags 
} from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { 
  createTicket, 
  closeTicket, 
  claimTicket, 
  updateTicketPriority, 
  getUserTicketCount 
} from '../../services/ticket.js';
import { checkRateLimit } from '../../utils/rateLimiter.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket management system')
    // Setup command
    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Configure ticket settings for this server')
      .addChannelOption(o => o
        .setName('category')
        .setDescription('Category to create tickets under')
        .setRequired(true))
      .addChannelOption(o => o
        .setName('log_channel')
        .setDescription('Channel to log ticket actions')
        .setRequired(false))
      .addChannelOption(o => o
        .setName('closed_category')
        .setDescription('Category for closed tickets')
        .setRequired(false))
      .addChannelOption(o => o
        .setName('transcript_channel')
        .setDescription('Channel to send transcripts when tickets are deleted')
        .setRequired(false))
      .addRoleOption(o => o
        .setName('staff_role')
        .setDescription('Role that can manage tickets')
        .setRequired(false))
      .addIntegerOption(o => o
        .setName('max_tickets')
        .setDescription('Maximum open tickets per user (default: 3)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10)))
    // Create ticket
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a new ticket')
      .addStringOption(o => o
        .setName('reason')
        .setDescription('Reason for the ticket')
        .setRequired(false))
      .addStringOption(o => o
        .setName('priority')
        .setDescription('Ticket priority')
        .setRequired(false)
        .addChoices(
          { name: 'None', value: 'none' },
          { name: 'Low', value: 'low' },
          { name: 'Medium', value: 'medium' },
          { name: 'High', value: 'high' },
          { name: 'Urgent', value: 'urgent' }
        )))
    // Create ticket for another user (staff only)
    .addSubcommand(sub => sub
      .setName('createfor')
      .setDescription('Create a ticket for another user (Staff only)')
      .addUserOption(o => o
        .setName('user')
        .setDescription('User to create ticket for')
        .setRequired(true))
      .addStringOption(o => o
        .setName('reason')
        .setDescription('Reason for the ticket')
        .setRequired(false))
      .addStringOption(o => o
        .setName('priority')
        .setDescription('Ticket priority')
        .setRequired(false)
        .addChoices(
          { name: 'None', value: 'none' },
          { name: 'Low', value: 'low' },
          { name: 'Medium', value: 'medium' },
          { name: 'High', value: 'high' },
          { name: 'Urgent', value: 'urgent' }
        )))
    // Strike ticket
    .addSubcommand(sub => sub
      .setName('strike')
      .setDescription('Create a strike infraction ticket')
      .addUserOption(o => o
        .setName('user')
        .setDescription('The user receiving this strike')
        .setRequired(true))
      .addStringOption(o => o
        .setName('reason')
        .setDescription('Reason for the strike')
        .setRequired(true)))
    // Claim ticket
    .addSubcommand(sub => sub
      .setName('claim')
      .setDescription('Claim this ticket'))
    // Priority
    .addSubcommand(sub => sub
      .setName('priority')
      .setDescription('Set ticket priority')
      .addStringOption(o => o
        .setName('level')
        .setDescription('Priority level')
        .setRequired(true)
        .addChoices(
          { name: 'None', value: 'none' },
          { name: 'Low', value: 'low' },
          { name: 'Medium', value: 'medium' },
          { name: 'High', value: 'high' },
          { name: 'Urgent', value: 'urgent' }
        )))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  category: 'moderation',

  async execute(interaction, config, client) {
    const sub = interaction.options.getSubcommand();

    try {
      // ═══════════════════════════════════════
      // SETUP
      // ═══════════════════════════════════════
      if (sub === 'setup') {
        const category = interaction.options.getChannel('category');
        const logChannel = interaction.options.getChannel('log_channel');
        const closedCategory = interaction.options.getChannel('closed_category');
        const transcriptChannel = interaction.options.getChannel('transcript_channel');
        const staffRole = interaction.options.getRole('staff_role');
        const maxTickets = interaction.options.getInteger('max_tickets');

        if (category.type !== ChannelType.GuildCategory) {
          return await interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'The category must be a category channel.')],
            flags: MessageFlags.Ephemeral
          });
        }

        const updateData = {
          ticketCategoryId: category.id,
        };

        if (logChannel) updateData.ticketLogChannelId = logChannel.id;
        if (closedCategory) updateData.ticketClosedCategoryId = closedCategory.id;
        if (transcriptChannel) updateData.ticketTranscriptChannelId = transcriptChannel.id;
        if (staffRole) updateData.ticketStaffRoleId = staffRole.id;
        if (maxTickets) updateData.maxTicketsPerUser = maxTickets;

        await updateGuildConfig(client, interaction.guildId, updateData);

        const fields = [
          { name: '📁 Open Category', value: category.name, inline: true }
        ];
        if (logChannel) fields.push({ name: '📋 Log Channel', value: `<#${logChannel.id}>`, inline: true });
        if (closedCategory) fields.push({ name: '🔒 Closed Category', value: closedCategory.name, inline: true });
        if (transcriptChannel) fields.push({ name: '📜 Transcript Channel', value: `<#${transcriptChannel.id}>`, inline: true });
        if (staffRole) fields.push({ name: '👥 Staff Role', value: `<@&${staffRole.id}>`, inline: true });
        if (maxTickets) fields.push({ name: '🎫 Max Tickets/User', value: String(maxTickets), inline: true });

        return await interaction.reply({
          embeds: [createEmbed({
            title: '✅ Ticket System Configured',
            color: 'success',
            fields,
            timestamp: true,
          })],
          flags: MessageFlags.Ephemeral
        });
      }

      // Load config for other commands
      const guildConfig = await getGuildConfig(client, interaction.guildId);
      const categoryId = guildConfig.ticketCategoryId;

      // ═══════════════════════════════════════
      // CREATE TICKET
      // ═══════════════════════════════════════
      if (sub === 'create') {
        if (!categoryId) {
          return await interaction.reply({
            embeds: [errorEmbed('Not Set Up', 'Run `/ticket setup` first.')],
            flags: MessageFlags.Ephemeral
          });
        }

        // Rate limiting
        const rateLimitKey = `${interaction.user.id}:create_ticket`;
        const allowed = await checkRateLimit(rateLimitKey, 3, 60000);
        if (!allowed) {
          return await interaction.reply({
            embeds: [errorEmbed('Rate Limited', 'You are creating tickets too quickly. Please wait a minute.')],
            flags: MessageFlags.Ephemeral
          });
        }

        // Check ticket limit
        const maxTickets = guildConfig.maxTicketsPerUser || 3;
        const currentCount = await getUserTicketCount(interaction.guildId, interaction.user.id);
        if (currentCount >= maxTickets) {
          return await interaction.reply({
            embeds: [errorEmbed(
              'Ticket Limit Reached',
              `You have ${currentCount}/${maxTickets} open tickets. Close existing tickets first.`
            )],
            flags: MessageFlags.Ephemeral
          });
        }

        const reason = interaction.options.getString('reason') || 'No reason provided';
        const priority = interaction.options.getString('priority') || 'none';

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const result = await createTicket(
          interaction.guild,
          interaction.member,
          categoryId,
          reason,
          priority
        );

        if (result.success) {
          await interaction.editReply({
            embeds: [successEmbed('Ticket Created', `Your ticket has been created in ${result.channel}!`)],
          });
        } else {
          await interaction.editReply({
            embeds: [errorEmbed('Error', result.error || 'Failed to create ticket.')],
          });
        }
      }

      // ═══════════════════════════════════════
      // CREATE FOR (Staff)
      // ═══════════════════════════════════════
      else if (sub === 'createfor') {
        if (!categoryId) {
          return await interaction.reply({
            embeds: [errorEmbed('Not Set Up', 'Run `/ticket setup` first.')],
            flags: MessageFlags.Ephemeral
          });
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const priority = interaction.options.getString('priority') || 'none';

        // Check target user's ticket limit
        const maxTickets = guildConfig.maxTicketsPerUser || 3;
        const currentCount = await getUserTicketCount(interaction.guildId, targetUser.id);
        if (currentCount >= maxTickets) {
          return await interaction.reply({
            embeds: [errorEmbed(
              'Ticket Limit Reached',
              `${targetUser} has ${currentCount}/${maxTickets} open tickets.`
            )],
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Get the target user as a GuildMember
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
          return await interaction.editReply({
            embeds: [errorEmbed('Error', 'Could not find that user in this server.')],
          });
        }

        const result = await createTicket(
          interaction.guild,
          targetMember,
          categoryId,
          `Created by ${interaction.user.tag} for ${targetUser.tag}\nReason: ${reason}`,
          priority
        );

        if (result.success) {
          await interaction.editReply({
            embeds: [successEmbed('Ticket Created', `Ticket for ${targetUser} created in ${result.channel}!`)],
          });
        } else {
          await interaction.editReply({
            embeds: [errorEmbed('Error', result.error || 'Failed to create ticket.')],
          });
        }
      }

      // ═══════════════════════════════════════
      // STRIKE TICKET
      // ═══════════════════════════════════════
      else if (sub === 'strike') {
        if (!categoryId) {
          return await interaction.reply({
            embeds: [errorEmbed('Not Set Up', 'Run `/ticket setup` first.')],
            flags: MessageFlags.Ephemeral
          });
        }

        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Get the target user as a GuildMember
        const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) {
          return await interaction.editReply({
            embeds: [errorEmbed('Error', 'Could not find that user in this server.')],
          });
        }

        const strikeReason = `⚠️ STRIKE ISSUED by ${interaction.user.tag}\n👤 User: ${user.tag}\n📝 Reason: ${reason}`;
        
        const result = await createTicket(
          interaction.guild,
          targetMember,
          categoryId,
          strikeReason,
          'high' // Strikes default to high priority
        );

        if (result.success) {
          // Send the strike notification in the ticket
          const strikeEmbed = createEmbed({
            title: '⚡ Infraction Strike Logged',
            description: `An official strike has been recorded for ${user}.`,
            color: 'error',
            fields: [
              { name: '👤 User', value: `${user}`, inline: true },
              { name: '🛡️ Issuing Officer', value: `${interaction.user}`, inline: true },
              { name: '📝 Reason', value: reason, inline: false },
            ],
            timestamp: true,
          });

          await result.channel.send({
            content: `${user}`,
            embeds: [strikeEmbed],
          });

          await interaction.editReply({
            embeds: [successEmbed('Strike Ticket Created', `Strike tracking active in ${result.channel}`)],
          });
        } else {
          await interaction.editReply({
            embeds: [errorEmbed('Error', result.error || 'Failed to create strike ticket.')],
          });
        }
      }

      // ═══════════════════════════════════════
      // CLAIM TICKET
      // ═══════════════════════════════════════
      else if (sub === 'claim') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const result = await claimTicket(interaction.channel, interaction.user);
        
        if (result.success) {
          await interaction.editReply({
            embeds: [successEmbed('Ticket Claimed', 'You have successfully claimed this ticket!')],
          });
        } else {
          await interaction.editReply({
            embeds: [errorEmbed('Error', result.error || 'Failed to claim ticket.')],
          });
        }
      }

      // ═══════════════════════════════════════
      // PRIORITY
      // ═══════════════════════════════════════
      else if (sub === 'priority') {
        const priority = interaction.options.getString('level');
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const result = await updateTicketPriority(interaction.channel, priority, interaction.user);
        
        if (result.success) {
          await interaction.editReply({
            embeds: [successEmbed('Priority Updated', `Ticket priority set to ${priority}.`)],
          });
        } else {
          await interaction.editReply({
            embeds: [errorEmbed('Error', result.error || 'Failed to update priority.')],
          });
        }
      }

    } catch (error) {
      logger.error('Ticket command error:', error);
      await handleInteractionError(interaction, error, { subtype: `ticket_${sub}_failed` });
    }
  },
};