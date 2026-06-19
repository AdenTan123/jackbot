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
import { getGuildConfig, updateGuildConfig, getTicketConfig } from '../../services/guildConfig.js';
import { 
  createTicket, 
  claimTicket, 
  updateTicketPriority, 
  getUserTicketCount 
} from '../../services/ticket.js';
import { checkRateLimit } from '../../utils/rateLimiter.js';

// Helper function to validate ticket channel context
function isTicketChannel(interaction, categoryId, closedCategoryId = null) {
  if (!interaction.channel) {
    logger.warn('Ticket command used outside of a channel', {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId
    });
    return false;
  }
  
  const parentId = interaction.channel.parentId;
  const isInTicketCategory = categoryId && parentId === categoryId;
  const isInClosedCategory = closedCategoryId && parentId === closedCategoryId;
  
  if (!isInTicketCategory && !isInClosedCategory) {
    logger.debug('Command used outside ticket category', {
      channelId: interaction.channel.id,
      parentId,
      expectedCategoryId: categoryId,
      closedCategoryId
    });
    return false;
  }
  
  return true;
}

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
    const startTime = Date.now();
    
    logger.info(`[Ticket] Command '/ticket ${sub}' executed by ${interaction.user.tag}`, {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      subcommand: sub
    });

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

        // Validate category type
        if (category.type !== ChannelType.GuildCategory) {
          logger.warn(`[Ticket Setup] Invalid category type: ${category.type}`, {
            guildId: interaction.guildId,
            userId: interaction.user.id,
            channelType: category.type
          });
          
          return await interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'The category must be a category channel.')],
            flags: MessageFlags.Ephemeral
          });
        }

        // Validate optional channels
        if (logChannel && logChannel.type !== ChannelType.GuildText) {
          return await interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'The log channel must be a text channel.')],
            flags: MessageFlags.Ephemeral
          });
        }

        if (transcriptChannel && transcriptChannel.type !== ChannelType.GuildText) {
          return await interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'The transcript channel must be a text channel.')],
            flags: MessageFlags.Ephemeral
          });
        }

        // Build update data
        const updateData = {
          ticketCategoryId: category.id,
        };

        if (logChannel) updateData.ticketLogChannelId = logChannel.id;
        if (closedCategory) updateData.ticketClosedCategoryId = closedCategory.id;
        if (transcriptChannel) updateData.ticketTranscriptChannelId = transcriptChannel.id;
        if (staffRole) updateData.ticketStaffRoleId = staffRole.id;
        if (maxTickets) updateData.maxTicketsPerUser = maxTickets;

        logger.info(`[Ticket Setup] Saving config for guild ${interaction.guildId}`, {
          updateData,
          userId: interaction.user.id
        });

        // Save config with error handling
        try {
          await updateGuildConfig(client, interaction.guildId, updateData);
          
          logger.info(`[Ticket Setup] Config saved successfully for guild ${interaction.guildId}`, {
            ticketCategoryId: category.id,
            executionTime: Date.now() - startTime
          });
        } catch (saveError) {
          logger.error(`[Ticket Setup] Failed to save config for guild ${interaction.guildId}`, {
            error: saveError.message,
            stack: saveError.stack,
            updateData
          });
          
          return await interaction.reply({
            embeds: [errorEmbed('Setup Failed', 'Failed to save configuration. Please try again or contact support.')],
            flags: MessageFlags.Ephemeral
          });
        }

        // Build success response
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
            description: 'The ticket system is now ready to use!\n\n**Available Commands:**\n• `/ticket open` - Create your own ticket\n• `/ticket create` - Create a ticket for someone else\n• `/ticket strike` - Create a strike ticket',
            color: 'success',
            fields,
            timestamp: true,
          })],
          flags: MessageFlags.Ephemeral
        });
      }

      // ═══════════════════════════════════════
      // LOAD CONFIG FOR OTHER COMMANDS
      // ═══════════════════════════════════════
      logger.debug(`[Ticket] Loading config for guild ${interaction.guildId}`);
      
      let guildConfig;
      try {
        guildConfig = await getGuildConfig(client, interaction.guildId);
        
        if (!guildConfig) {
          logger.warn(`[Ticket] No config returned for guild ${interaction.guildId}`);
          guildConfig = {};
        }
      } catch (configError) {
        logger.error(`[Ticket] Failed to load guild config`, {
          guildId: interaction.guildId,
          error: configError.message,
          stack: configError.stack
        });
        
        // Don't fail completely - use empty config
        guildConfig = {};
      }
      
      const categoryId = guildConfig.ticketCategoryId || null;
      const closedCategoryId = guildConfig.ticketClosedCategoryId || null;
      
      logger.debug(`[Ticket] Config loaded for guild ${interaction.guildId}`, {
        categoryId,
        closedCategoryId,
        hasCategoryId: !!categoryId,
        configKeys: Object.keys(guildConfig)
      });

      // ═══════════════════════════════════════
      // OPEN TICKET (for self)
      // ═══════════════════════════════════════
      if (sub === 'open') {
        if (!categoryId) {
          logger.warn(`[Ticket Open] Ticket system not configured for guild ${interaction.guildId}`, {
            userId: interaction.user.id
          });
          
          return await interaction.reply({
            embeds: [errorEmbed(
              'Not Set Up', 
              'The ticket system has not been configured yet.\n\nAn admin needs to run `/ticket setup` first.'
            )],
            flags: MessageFlags.Ephemeral
          });
        }

        // Rate limiting
        const rateLimitKey = `${interaction.user.id}:create_ticket`;
        try {
          const allowed = await checkRateLimit(rateLimitKey, 3, 60000);
          if (!allowed) {
            logger.warn(`[Ticket Open] Rate limit hit for user ${interaction.user.tag}`, {
              userId: interaction.user.id,
              guildId: interaction.guildId
            });
            
            return await interaction.reply({
              embeds: [errorEmbed('Rate Limited', 'You are creating tickets too quickly. Please wait a minute.')],
              flags: MessageFlags.Ephemeral
            });
          }
        } catch (rateLimitError) {
          logger.error(`[Ticket Open] Rate limit check failed`, {
            error: rateLimitError.message,
            userId: interaction.user.id
          });
          // Continue anyway - rate limiting is non-critical
        }

        // Check ticket limit
        const maxTickets = guildConfig.maxTicketsPerUser || 3;
        let currentCount = 0;
        try {
          currentCount = await getUserTicketCount(interaction.guildId, interaction.user.id);
          
          if (currentCount >= maxTickets) {
            logger.info(`[Ticket Open] User ${interaction.user.tag} at ticket limit`, {
              userId: interaction.user.id,
              currentCount,
              maxTickets
            });
            
            return await interaction.reply({
              embeds: [errorEmbed(
                'Ticket Limit Reached',
                `You have ${currentCount}/${maxTickets} open tickets.\n\nPlease close your existing tickets before creating a new one.`
              )],
              flags: MessageFlags.Ephemeral
            });
          }
        } catch (countError) {
          logger.error(`[Ticket Open] Failed to check ticket count`, {
            error: countError.message,
            userId: interaction.user.id
          });
          // Continue anyway - ticket count check is non-critical
        }

        const reason = interaction.options.getString('reason') || 'No reason provided';
        const priority = interaction.options.getString('priority') || 'none';

        logger.info(`[Ticket Open] Creating ticket for ${interaction.user.tag}`, {
          userId: interaction.user.id,
          guildId: interaction.guildId,
          reason,
          priority
        });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let result;
        try {
          result = await createTicket(
            interaction.guild,
            interaction.member,
            categoryId,
            reason,
            priority
          );
        } catch (createError) {
          logger.error(`[Ticket Open] Failed to create ticket`, {
            error: createError.message,
            stack: createError.stack,
            userId: interaction.user.id,
            guildId: interaction.guildId
          });
          
          return await interaction.editReply({
            embeds: [errorEmbed('Error', 'Failed to create ticket. Please try again later.')],
          });
        }

        if (result.success) {
          logger.info(`[Ticket Open] Ticket created successfully`, {
            userId: interaction.user.id,
            channelId: result.channel?.id,
            executionTime: Date.now() - startTime
          });
          
          await interaction.editReply({
            embeds: [successEmbed('Ticket Created', `Your ticket has been created in ${result.channel}!`)],
          });
        } else {
          logger.warn(`[Ticket Open] Ticket creation returned failure`, {
            userId: interaction.user.id,
            error: result.error
          });
          
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

        logger.info(`[Ticket Create] Staff creating ticket`, {
          staffUserId: interaction.user.id,
          targetUser: user?.id,
          targetRole: role?.id,
          creator: creator.id,
          reason,
          priority
        });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Check ticket limit for target user
        if (user) {
          try {
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
          } catch (countError) {
            logger.error(`[Ticket Create] Failed to check target user ticket count`, {
              error: countError.message,
              targetUserId: user.id
            });
            // Continue anyway
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

        let result;
        try {
          result = await createTicket(
            interaction.guild,
            targetMember,
            categoryId,
            fullReason,
            priority
          );
        } catch (createError) {
          logger.error(`[Ticket Create] Failed to create ticket`, {
            error: createError.message,
            stack: createError.stack
          });
          
          return await interaction.editReply({
            embeds: [errorEmbed('Error', 'Failed to create ticket. Please try again later.')],
          });
        }

        if (result.success) {
          // Add role permissions if specified
          if (role) {
            try {
              await result.channel.permissionOverwrites.create(role, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
              });
              logger.debug(`[Ticket Create] Added role ${role.name} to ticket ${result.channel.id}`);
            } catch (permError) {
              logger.warn(`[Ticket Create] Could not add role ${role.name} to ticket`, {
                error: permError.message,
                channelId: result.channel.id
              });
            }
          }

          // Add the creator (staff member) if different from target
          if (user && creator.id !== user.id) {
            try {
              await result.channel.permissionOverwrites.create(creator, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
              });
              logger.debug(`[Ticket Create] Added creator ${creator.tag} to ticket ${result.channel.id}`);
            } catch (permError) {
              logger.warn(`[Ticket Create] Could not add creator ${creator.tag} to ticket`, {
                error: permError.message,
                channelId: result.channel.id
              });
            }
          }

          // Send info message in ticket
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

          logger.info(`[Ticket Create] Ticket created successfully`, {
            channelId: result.channel.id,
            targetUser: user?.id,
            targetRole: role?.id,
            executionTime: Date.now() - startTime
          });

          await interaction.editReply({
            embeds: [successEmbed('Ticket Created', `Ticket created in ${result.channel}!`)],
          });
        } else {
          logger.warn(`[Ticket Create] Creation returned failure`, {
            error: result.error
          });
          
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

        logger.info(`[Ticket Strike] Creating strike ticket`, {
          staffUserId: interaction.user.id,
          targetUser: user.id,
          officer: creator.id,
          reason
        });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) {
          return await interaction.editReply({
            embeds: [errorEmbed('Error', 'Could not find that user in this server.')],
          });
        }

        const strikeReason = `⚠️ STRIKE ISSUED\n👤 User: ${user.tag}\n🛡️ Officer: ${creator.tag}\n📝 Reason: ${reason}`;
        
        let result;
        try {
          result = await createTicket(
            interaction.guild,
            targetMember,
            categoryId,
            strikeReason,
            'high'
          );
        } catch (createError) {
          logger.error(`[Ticket Strike] Failed to create strike ticket`, {
            error: createError.message,
            stack: createError.stack
          });
          
          return await interaction.editReply({
            embeds: [errorEmbed('Error', 'Failed to create strike ticket.')],
          });
        }

        if (result.success) {
          // Add the officer to the ticket
          if (creator.id !== user.id) {
            try {
              await result.channel.permissionOverwrites.create(creator, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
              });
            } catch (permError) {
              logger.warn(`[Ticket Strike] Could not add officer to ticket`, {
                error: permError.message,
                officerId: creator.id
              });
            }
          }

          // Send strike notification
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

          logger.info(`[Ticket Strike] Strike ticket created successfully`, {
            channelId: result.channel.id,
            targetUser: user.id,
            officer: creator.id,
            executionTime: Date.now() - startTime
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

        if (!isTicketChannel(interaction, categoryId, closedCategoryId)) {
          return await interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'This command can only be used inside a ticket channel.')],
            flags: MessageFlags.Ephemeral
          });
        }

        logger.info(`[Ticket Bring] Adding user to ticket`, {
          channelId: interaction.channel.id,
          targetUser: targetUser.id,
          staffUser: interaction.user.id
        });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          await interaction.channel.permissionOverwrites.create(targetUser, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
          });
        } catch (permError) {
          try {
            await interaction.channel.permissionOverwrites.edit(targetUser, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
              AttachFiles: true,
            });
          } catch (editError) {
            logger.error(`[Ticket Bring] Failed to add user permissions`, {
              error: editError.message,
              channelId: interaction.channel.id,
              targetUser: targetUser.id
            });
            
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

        if (!isTicketChannel(interaction, categoryId, closedCategoryId)) {
          return await interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'This command can only be used inside a ticket channel.')],
            flags: MessageFlags.Ephemeral
          });
        }

        logger.info(`[Ticket Remove] Removing user from ticket`, {
          channelId: interaction.channel.id,
          targetUser: targetUser.id,
          staffUser: interaction.user.id
        });

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
            logger.error(`[Ticket Remove] Failed to remove user permissions`, {
              error: createError.message,
              channelId: interaction.channel.id,
              targetUser: targetUser.id
            });
            
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
        if (!isTicketChannel(interaction, categoryId, closedCategoryId)) {
          return await interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'This command can only be used inside a ticket channel.')],
            flags: MessageFlags.Ephemeral
          });
        }

        logger.info(`[Ticket Claim] Claiming ticket`, {
          channelId: interaction.channel.id,
          userId: interaction.user.id
        });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        let result;
        try {
          result = await claimTicket(interaction.channel, interaction.user);
        } catch (claimError) {
          logger.error(`[Ticket Claim] Failed to claim ticket`, {
            error: claimError.message,
            channelId: interaction.channel.id
          });
          
          return await interaction.editReply({
            embeds: [errorEmbed('Error', 'Failed to claim ticket.')],
          });
        }
        
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
        if (!isTicketChannel(interaction, categoryId, closedCategoryId)) {
          return await interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'This command can only be used inside a ticket channel.')],
            flags: MessageFlags.Ephemeral
          });
        }

        const priority = interaction.options.getString('level');
        
        logger.info(`[Ticket Priority] Changing priority`, {
          channelId: interaction.channel.id,
          userId: interaction.user.id,
          priority
        });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        let result;
        try {
          result = await updateTicketPriority(interaction.channel, priority, interaction.user);
        } catch (priorityError) {
          logger.error(`[Ticket Priority] Failed to update priority`, {
            error: priorityError.message,
            channelId: interaction.channel.id,
            priority
          });
          
          return await interaction.editReply({
            embeds: [errorEmbed('Error', 'Failed to update priority.')],
          });
        }
        
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

      // Log command completion
      logger.info(`[Ticket] Command '/ticket ${sub}' completed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        executionTime: Date.now() - startTime
      });

    } catch (error) {
      logger.error(`[Ticket] Unhandled error in '/ticket ${sub}'`, {
        error: error.message,
        stack: error.stack,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        subcommand: sub,
        executionTime: Date.now() - startTime
      });
      
      await handleInteractionError(interaction, error, { 
        subtype: `ticket_${sub}_failed`,
        guildId: interaction.guildId,
        userId: interaction.user.id
      });
    }
  },
};