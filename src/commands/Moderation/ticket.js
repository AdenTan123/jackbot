import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import {
  createTicket,
  getUserTicketCount,
} from '../../services/ticket.js';
import { checkRateLimit } from '../../utils/rateLimiter.js';

// ─── Helper to check if we’re inside a ticket channel ───
function inTicketChannel(interaction, categoryId, closedCategoryId) {
  if (!interaction.channel) return false;
  const parent = interaction.channel.parentId;
  return (categoryId && parent === categoryId) ||
         (closedCategoryId && parent === closedCategoryId);
}

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system (multiguild)')
    // ── /ticket setup ──
    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Configure the ticket system')
      .addChannelOption(o =>
        o.setName('category')
         .setDescription('Category where tickets are created')
         .setRequired(true))
      .addChannelOption(o =>
        o.setName('log_channel')
         .setDescription('Channel for ticket logs (optional)')
         .setRequired(false))
      .addChannelOption(o =>
        o.setName('closed_category')
         .setDescription('Category for closed tickets (optional)')
         .setRequired(false))
      .addChannelOption(o =>
        o.setName('transcript_channel')
         .setDescription('Channel for transcripts (optional)')
         .setRequired(false))
      .addRoleOption(o =>
        o.setName('staff_role')
         .setDescription('Role that can manage tickets (optional)')
         .setRequired(false))
      .addIntegerOption(o =>
        o.setName('max_tickets')
         .setDescription('Max open tickets per user (default 3)')
         .setRequired(false)
         .setMinValue(1)
         .setMaxValue(10)))
    // ── /ticket create (staff) ──
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a ticket for a user or role (staff only)')
      .addUserOption(o =>
        o.setName('user')
         .setDescription('User to add to the ticket')
         .setRequired(false))
      .addRoleOption(o =>
        o.setName('role')
         .setDescription('Role to add to the ticket')
         .setRequired(false))
      .addUserOption(o =>
        o.setName('creator')
         .setDescription('Staff member assigned to the ticket')
         .setRequired(false))
      .addStringOption(o =>
        o.setName('reason')
         .setDescription('Reason for the ticket')
         .setRequired(false))
      .addStringOption(o =>
        o.setName('priority')
         .setDescription('Priority level (optional)')
         .setRequired(false)))
    // ── /ticket open (self) ──
    .addSubcommand(sub => sub
      .setName('open')
      .setDescription('Create your own ticket')
      .addStringOption(o =>
        o.setName('reason')
         .setDescription('Reason for the ticket')
         .setRequired(false)))
    // ── /ticket bring / remove / claim / priority ──
    .addSubcommand(sub => sub
      .setName('bring')
      .setDescription('Add a user to this ticket')
      .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a user from this ticket')
      .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('claim')
      .setDescription('Claim this ticket'))
    .addSubcommand(sub => sub
      .setName('priority')
      .setDescription('Update ticket priority')
      .addStringOption(o => 
        o.setName('level')
         .setDescription('Priority level')
         .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  category: 'moderation',

  async execute(interaction, config, client) {
    const sub = interaction.options.getSubcommand();

    try {
      // ─────────────────────────────────────────────
      //  SETUP – saves directly to the guild config
      // ─────────────────────────────────────────────
      if (sub === 'setup') {
        const category = interaction.options.getChannel('category');
        const logChannel = interaction.options.getChannel('log_channel');
        const closedCategory = interaction.options.getChannel('closed_category');
        const transcriptChannel = interaction.options.getChannel('transcript_channel');
        const staffRole = interaction.options.getRole('staff_role');
        const maxTickets = interaction.options.getInteger('max_tickets');

        if (category.type !== ChannelType.GuildCategory) {
          return interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'The category must be a category channel.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        // Build the updates object
        const updates = { ticketCategoryId: category.id };
        if (logChannel)           updates.ticketLogChannelId = logChannel.id;
        if (closedCategory)       updates.ticketClosedCategoryId = closedCategory.id;
        if (transcriptChannel)    updates.ticketTranscriptChannelId = transcriptChannel.id;
        if (staffRole)            updates.ticketStaffRoleId = staffRole.id;
        if (maxTickets)           updates.maxTicketsPerUser = maxTickets;

        const configKey = `guild:${interaction.guildId}:config`;   // the key used by database.js

        try {
          // Fetch existing raw config (or start with empty object)
          let current = {};
          try {
            const raw = await client.db.get(configKey, {});
            if (raw && typeof raw === 'object') current = raw;
          } catch (_) {}

          // Merge and save directly (bypasses any schema validation)
          const merged = { ...current, ...updates };
          await client.db.set(configKey, merged);

          // Build a nice success embed
          const fields = [{ name: '📁 Category', value: category.name, inline: true }];
          if (logChannel)        fields.push({ name: '📋 Log Channel', value: `<#${logChannel.id}>`, inline: true });
          if (closedCategory)    fields.push({ name: '🔒 Closed Category', value: closedCategory.name, inline: true });
          if (transcriptChannel) fields.push({ name: '📜 Transcript Channel', value: `<#${transcriptChannel.id}>`, inline: true });
          if (staffRole)         fields.push({ name: '👥 Staff Role', value: `<@&${staffRole.id}>`, inline: true });
          if (maxTickets)        fields.push({ name: '🎫 Max Tickets/User', value: String(maxTickets), inline: true });

          return interaction.reply({
            embeds: [createEmbed({
              title: '✅ Ticket System Configured',
              description: 'The ticket system is now ready.\nUse `/ticket open` or `/ticket create`.',
              color: 'success',
              fields,
              timestamp: true,
            })],
            flags: MessageFlags.Ephemeral,
          });
        } catch (err) {
          logger.error('[ticket setup] Direct DB save failed:', err);
          return interaction.reply({
            embeds: [errorEmbed('Setup Failed', `Database error: ${err.message}`)],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      // ─────────────────────────────────────────────
      //  For all other commands, load config normally
      // ─────────────────────────────────────────────
      let guildConfig = {};
      try {
        guildConfig = await getGuildConfig(client, interaction.guildId);
      } catch (e) {
        logger.warn('[ticket] Could not load config, using empty:', e);
      }
      const categoryId = guildConfig.ticketCategoryId || null;
      const closedCategoryId = guildConfig.ticketClosedCategoryId || null;

      // Quick helper to bail if not set up
      const requireSetup = () => {
        if (!categoryId) {
          interaction.reply({
            embeds: [errorEmbed('Not Set Up', 'Run `/ticket setup` first.')],
            flags: MessageFlags.Ephemeral,
          });
          return false;
        }
        return true;
      };

      // ─────────────────────────────────────────────
      //  /ticket open  (self‑creation)
      // ─────────────────────────────────────────────
      if (sub === 'open') {
        if (!requireSetup()) return;

        const maxTickets = guildConfig.maxTicketsPerUser ?? 3;
        const currentCount = await getUserTicketCount(interaction.guildId, interaction.user.id).catch(() => 0);
        if (currentCount >= maxTickets) {
          return interaction.reply({
            embeds: [errorEmbed('Ticket Limit', `You have ${currentCount}/${maxTickets} open tickets.`)],
            flags: MessageFlags.Ephemeral,
          });
        }

        // Rate limiting (safe)
        const allowed = await checkRateLimit(`${interaction.user.id}:create_ticket`, 3, 60000).catch(() => true);
        if (!allowed) {
          return interaction.reply({
            embeds: [errorEmbed('Rate Limited', 'You are creating tickets too quickly.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        const reason = interaction.options.getString('reason') || 'No reason provided';

        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) return;

        const result = await createTicket(interaction.guild, interaction.member, categoryId, reason);
        if (result.success) {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Ticket Created', `Your ticket is ready in ${result.channel}!`)],
          });
        } else {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Error', result.error || 'Failed to create ticket.')],
          });
        }
      }

      // ─────────────────────────────────────────────
      //  /ticket create  (staff for user/role)
      // ─────────────────────────────────────────────
      else if (sub === 'create') {
        if (!requireSetup()) return;

        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        const creator = interaction.options.getUser('creator') || interaction.user;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const priority = interaction.options.getString('priority') || 'none';

        if (!user && !role) {
          return interaction.reply({
            embeds: [errorEmbed('Missing Target', 'You must provide either a user or a role.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) return;

        // Determine the ticket “owner” (the member who gets the ticket)
        let targetMember;
        if (user) {
          targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
          if (!targetMember) {
            return InteractionHelper.safeEditReply(interaction, {
              embeds: [errorEmbed('Error', 'Could not find that user in this server.')],
            });
          }

          // Check target’s ticket limit
          const maxTickets = guildConfig.maxTicketsPerUser ?? 3;
          const currentCount = await getUserTicketCount(interaction.guildId, user.id).catch(() => 0);
          if (currentCount >= maxTickets) {
            return InteractionHelper.safeEditReply(interaction, {
              embeds: [errorEmbed('Ticket Limit', `${user} has ${currentCount}/${maxTickets} open tickets.`)],
            });
          }
        } else {
          // Role ticket → the creator becomes the “owner” for the ticket service
          targetMember = interaction.member;
        }

        // Build a descriptive reason
        let fullReason = reason;
        if (user && role) fullReason = `Ticket for ${user.tag} and role ${role.name}\nStaff: ${interaction.user.tag}\nReason: ${reason}`;
        else if (user)    fullReason = `Ticket for ${user.tag}\nStaff: ${interaction.user.tag}\nReason: ${reason}`;
        else if (role)    fullReason = `Role ticket for ${role.name}\nStaff: ${interaction.user.tag}\nReason: ${reason}`;

        const result = await createTicket(interaction.guild, targetMember, categoryId, fullReason, priority);
        if (!result.success) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Error', result.error || 'Failed to create ticket.')],
          });
        }

        // Add the role to the ticket (if specified)
        if (role) {
          await result.channel.permissionOverwrites.create(role, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
          }).catch(() => {});
        }

        // Add the staff creator if different from the ticket owner
        if (user && creator.id !== user.id) {
          await result.channel.permissionOverwrites.create(creator, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
          }).catch(() => {});
        }

        // Post an info embed in the ticket
        const infoEmbed = createEmbed({
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
        await result.channel.send({ embeds: [infoEmbed] });

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Ticket Created', `Ticket created in ${result.channel}!`)],
        });
      }

      // ─────────────────────────────────────────────
      //  BRING / REMOVE / CLAIM / PRIORITY (basic implementations)
      // ─────────────────────────────────────────────
      if (['bring', 'remove', 'claim', 'priority'].includes(sub)) {
        if (!inTicketChannel(interaction, categoryId, closedCategoryId)) {
          return interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'This command can only be used inside a ticket channel.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        if (sub === 'bring' || sub === 'remove') {
          const target = interaction.options.getUser('user');
          const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
          if (!deferSuccess) return;

          const perms = sub === 'bring'
            ? { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true }
            : { ViewChannel: false, SendMessages: false, ReadMessageHistory: false, AddReactions: false, AttachFiles: false, EmbedLinks: false };

          try {
            await interaction.channel.permissionOverwrites.create(target, perms);
          } catch {
            await interaction.channel.permissionOverwrites.edit(target, perms).catch(() => {});
          }

          const embedTitle = sub === 'bring' ? '➕ User Added' : '➖ User Removed';
          const embedColor = sub === 'bring' ? 'info' : 'warning';
          await interaction.channel.send({
            content: sub === 'bring' ? `${target}` : undefined,
            embeds: [createEmbed({ title: embedTitle, description: `${target} has been ${sub === 'bring' ? 'added to' : 'removed from'} this ticket by ${interaction.user}.`, color: embedColor, timestamp: true })],
          });

          return InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Done', `${target} has been ${sub === 'bring' ? 'added' : 'removed'}.`)],
          });
        }

        if (sub === 'claim') {
          const { claimTicket } = await import('../../services/ticket.js');
          const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
          if (!deferSuccess) return;
          const result = await claimTicket(interaction.channel, interaction.user);
          return InteractionHelper.safeEditReply(interaction, {
            embeds: result.success
              ? [successEmbed('Ticket Claimed', 'You have claimed this ticket!')]
              : [errorEmbed('Error', result.error || 'Failed to claim.')],
          });
        }

        if (sub === 'priority') {
          const { updateTicketPriority } = await import('../../services/ticket.js');
          const level = interaction.options.getString('level');
          const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
          if (!deferSuccess) return;
          const result = await updateTicketPriority(interaction.channel, level, interaction.user);
          return InteractionHelper.safeEditReply(interaction, {
            embeds: result.success
              ? [successEmbed('Priority Updated', `Priority set to ${level}.`)]
              : [errorEmbed('Error', result.error || 'Failed to update priority.')],
          });
        }
      }

    } catch (error) {
      logger.error(`[ticket] Unhandled error in /ticket ${sub}:`, error);
      await handleInteractionError(interaction, error, { subtype: `ticket_${sub}_failed` });
    }
  },
};