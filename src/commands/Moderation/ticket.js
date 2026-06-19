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
    // Create ticket (staff creating for others)
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a ticket for a user or role (Staff only)')
      .addUserOption(o => o
        .setName('user')
        .setDescription('User to add to the ticket')
        .setRequired(false))
      .addRoleOption(o => o
        .setName('role')
        .setDescription('Role to add to the ticket (adds all role members)')
        .setRequired(false))
      .addUserOption(o => o
        .setName('creator')
        .setDescription('Person assigned to the ticket')
        .setRequired(false))
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
    // Create personal ticket (for self)
    .addSubcommand(sub => sub
      .setName('open')
      .setDescription('Create your own ticket')
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
        .setRequired(true))
      .addUserOption(o => o
        .setName('creator')
        .setDescription('Staff executor issuing this strike')
        .setRequired(false)))
    // Bring user to ticket
    .addSubcommand(sub => sub
      .setName('bring')
      .setDescription('Add a user to this ticket')
      .addUserOption(o => o
        .setName('user')
        .setDescription('User to add')
        .setRequired(true)))
    // Remove user from ticket
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a user from this ticket')
      .addUserOption(o => o
        .setName('user')
        .setDescription('User to remove')
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
      const categoryId = guildConfig.ticketCategoryId || null;

      // ═══════════════════════════════════════
      // OPEN TICKET (for self)
      // ═══════════════════════════════════════
      if (sub === 'open') {
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
      // CREATE TICKET (staff creating for others)
      // ═══════════════════════════════════════
      else if (sub === 'create') {
        if (!categoryId) {
          return await interaction.reply({
            embeds: [errorEmbed('Not Set Up', 'Run `/ticket setup` first.')],
            flags: MessageFlags.Ephemeral
          });
        }

        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        const creator = interaction.options.getUser('creator') || interaction.user;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const priority = interaction.options.getString('priority') || 'none';

        if (!user && !role) {
          return await interaction.reply({
            embeds: [errorEmbed('Missing Target', 'You must provide either a user or a role.')],
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // If creating for a user, check their ticket limit
        if (user) {
          const maxTickets = guildConfig.maxTicketsPerUser || 3;
          const currentCount = await getUserTicketCount(interaction.guildId, user.id);
          if (currentCount >= maxTickets) {
            return await interaction.editReply({
              embeds: [errorEmbed(
                'Ticket Limit Reached',
                `${user} has ${currentCount}/${maxTickets} open tickets.`
              )],
            });
          }
        }

        // Get the target member
        let targetMember;
        if (user) {
          targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
          if (!targetMember) {
            return await interaction.editReply({
              embeds: [errorEmbed('Error', 'Could not find that user in this server.')],
            });
          }
        } else {
          // For role tickets, use the creator as the member
          targetMember = await interaction.guild.members.fetch(creator.id).catch(() => null) || interaction.member;
        }

        // Build the reason with context
        let fullReason = reason;
        if (user && role) {
          fullReason = `Ticket for ${user.tag} and role ${role.name}\nCreated by: ${interaction.user.tag}\nReason: ${reason}`;
        } else if (user) {
          fullReason = `Ticket for ${user.tag}\nCreated by: ${interaction.user.tag}\nReason: ${reason}`;
        } else if (role) {
          fullReason = `Role ticket for ${role.name}\nCreated by: ${interaction.user.tag}\nReason: ${reason}`;
        }

        const result = await createTicket(
          interaction.guild,
          targetMember,
          categoryId,
          fullReason,
          priority
        );

        if (result.success) {
          // Add the role to the ticket if specified
          if (role) {
            try {
              await result.channel.permissionOverwrites.create(role, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
              });
            } catch (permError) {
              logger.warn(`Could not add role ${role.name} to ticket: ${permError.message}`);
            }
          }

          // Add the creator (staff member) to the ticket if different from target
          if (user && creator.id !== user.id) {
            try {
              await result.channel.permissionOverwrites.create(creator, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
              });
            } catch (permError) {
              logger.warn(`Could not add creator ${creator.tag} to ticket: ${permError.message}`);
            }
          }

          // Send a custom message in the ticket
          const ticketInfoEmbed = createEmbed({
            title: '🎫 Ticket Created',
            description: `This ticket was created by ${interaction.user} for ${user || role}.`,
            color: 'info',
            fields: [
              ...(user ? [{ name: '👤 User', value: `${user}`, inline: true }] : []),
              ...(role ? [{ name: '🎭 Role', value: `${role}`, inline: true }] : []),
              { name: '🙋 Creator', value: `${creator}`, inline: true },
              { name: '📝 Reason', value: reason, inline: false },
            ],
            timestamp: true,
          });

          await result.channel.send({ embeds: [ticketInfoEmbed] });

          await interaction.editReply({
            embeds: [successEmbed('Ticket Created', `Ticket created in ${result.channel}!`)],
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
        const creator = interaction.options.getUser('creator') || interaction.user;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Get the target user as a GuildMember
        const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) {
          return await interaction.editReply({
            embeds: [errorEmbed('Error', 'Could not find that user in this server.')],
          });
        }

        const strikeReason = `⚠️ STRIKE ISSUED\n👤 User: ${user.tag}\n🛡️ Officer: ${creator.tag}\n📝 Reason: ${reason}`;
        
        const result = await createTicket(
          interaction.guild,
          targetMember,
          categoryId,
          strikeReason,
          'high' // Strikes default to high priority
        );

        if (result.success) {
          // Add the creator (officer) to the ticket
          if (creator.id !== user.id) {
            try {
              await result.channel.permissionOverwrites.create(creator, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
              });
            } catch (permError) {
              logger.warn(`Could not add officer ${creator.tag} to strike ticket: ${permError.message}`);
            }
          }

          // Send the strike notification in the ticket
          const strikeEmbed = createEmbed({
            title: '⚡ Infraction Strike Logged',
            description: `An official strike has been recorded for ${user}.`,
            color: 'error',
            fields: [
              { name: '👤 User', value: `${user}`, inline: true },
              { name: '🛡️ Issuing Officer', value: `${creator}`, inline: true },
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
      // BRING USER TO TICKET
      // ═══════════════════════════════════════
      else if (sub === 'bring') {
        const targetUser = interaction.options.getUser('user');

        if (!categoryId || interaction.channel.parentId !== categoryId) {
          // Also check closed category if configured
          const closedCategoryId = guildConfig.ticketClosedCategoryId;
          if (!closedCategoryId || interaction.channel.parentId !== closedCategoryId) {
            return await interaction.reply({
              embeds: [errorEmbed('Invalid Channel', 'This command can only be used inside a ticket channel.')],
              flags: MessageFlags.Ephemeral
            });
          }
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          await interaction.channel.permissionOverwrites.create(targetUser, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
          });
        } catch (permError) {
          // If overwrite exists, edit it
          try {
            await interaction.channel.permissionOverwrites.edit(targetUser, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
              AttachFiles: true,
            });
          } catch (editError) {
            return await interaction.editReply({
              embeds: [errorEmbed('Error', 'Failed to add user to ticket.')],
            });
          }
        }

        await interaction.channel.send({
          content: `${targetUser}`,
          embeds: [createEmbed({
            title: '➕ User Added',
            description: `${targetUser} has been added to this ticket by ${interaction.user}.`,
            color: 'info',
            timestamp: true,
          })],
        });

        await interaction.editReply({
          embeds: [successEmbed('User Added', `${targetUser} has been added to the ticket.`)],
        });
      }

      // ═══════════════════════════════════════
      // REMOVE USER FROM TICKET
      // ═══════════════════════════════════════
      else if (sub === 'remove') {
        const targetUser = interaction.options.getUser('user');

        if (!categoryId || interaction.channel.parentId !== categoryId) {
          const closedCategoryId = guildConfig.ticketClosedCategoryId;
          if (!closedCategoryId || interaction.channel.parentId !== closedCategoryId) {
            return await interaction.reply({
              embeds: [errorEmbed('Invalid Channel', 'This command can only be used inside a ticket channel.')],
              flags: MessageFlags.Ephemeral
            });
          }
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          await interaction.channel.permissionOverwrites.edit(targetUser, {
            ViewChannel: false,
            SendMessages: false,
            ReadMessageHistory: false,
            AddReactions: false,
            AttachFiles: false,
            EmbedLinks: false,
          });
        } catch (permError) {
          // If overwrite doesn't exist, create it with deny
          try {
            await interaction.channel.permissionOverwrites.create(targetUser, {
              ViewChannel: false,
              SendMessages: false,
              ReadMessageHistory: false,
              AddReactions: false,
              AttachFiles: false,
              EmbedLinks: false,
            });
          } catch (createError) {
            return await interaction.editReply({
              embeds: [errorEmbed('Error', 'Failed to remove user from ticket.')],
            });
          }
        }

        await interaction.channel.send({
          embeds: [createEmbed({
            title: '➖ User Removed',
            description: `${targetUser} has been removed from this ticket by ${interaction.user}.`,
            color: 'warning',
            timestamp: true,
          })],
        });

        await interaction.editReply({
          embeds: [successEmbed('User Removed', `${targetUser} has been removed from the ticket.`)],
        });
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