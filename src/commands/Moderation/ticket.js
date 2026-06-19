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
import { getGuildConfig } from '../../services/guildConfig.js';   // still used for reading
import {
  createTicket,
  claimTicket,
  updateTicketPriority,
  getUserTicketCount,
} from '../../services/ticket.js';
import { checkRateLimit } from '../../utils/rateLimiter.js';

function isTicketChannel(interaction, categoryId, closedCategoryId) {
  if (!interaction.channel) return false;
  const parentId = interaction.channel.parentId;
  return (categoryId && parentId === categoryId) ||
         (closedCategoryId && parentId === closedCategoryId);
}

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket management system')
    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Configure ticket settings for this server')
      .addChannelOption(o => o.setName('category').setDescription('Category to create tickets under').setRequired(true))
      .addChannelOption(o => o.setName('log_channel').setDescription('Channel to log ticket actions').setRequired(false))
      .addChannelOption(o => o.setName('closed_category').setDescription('Category for closed tickets').setRequired(false))
      .addChannelOption(o => o.setName('transcript_channel').setDescription('Channel to send transcripts').setRequired(false))
      .addRoleOption(o => o.setName('staff_role').setDescription('Role that can manage tickets').setRequired(false))
      .addIntegerOption(o => o.setName('max_tickets').setDescription('Max open tickets per user (default 3)').setRequired(false).setMinValue(1).setMaxValue(10)))
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a ticket for a user or role (Staff only)')
      .addUserOption(o => o.setName('user').setDescription('User to add to the ticket').setRequired(false))
      .addRoleOption(o => o.setName('role').setDescription('Role to add to the ticket').setRequired(false))
      .addUserOption(o => o.setName('creator').setDescription('Person assigned to the ticket').setRequired(false))
      .addStringOption(o => o.setName('reason').setDescription('Reason for the ticket').setRequired(false))
      .addStringOption(o => o.setName('priority').setDescription('Ticket priority').setRequired(false)
        .addChoices({ name: 'None', value: 'none' }, { name: 'Low', value: 'low' }, { name: 'Medium', value: 'medium' }, { name: 'High', value: 'high' }, { name: 'Urgent', value: 'urgent' })))
    .addSubcommand(sub => sub
      .setName('open')
      .setDescription('Create your own ticket')
      .addStringOption(o => o.setName('reason').setDescription('Reason for the ticket').setRequired(false))
      .addStringOption(o => o.setName('priority').setDescription('Ticket priority').setRequired(false)
        .addChoices({ name: 'None', value: 'none' }, { name: 'Low', value: 'low' }, { name: 'Medium', value: 'medium' }, { name: 'High', value: 'high' }, { name: 'Urgent', value: 'urgent' })))
    .addSubcommand(sub => sub
      .setName('strike')
      .setDescription('Create a strike infraction ticket')
      .addUserOption(o => o.setName('user').setDescription('The user receiving this strike').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for the strike').setRequired(true))
      .addUserOption(o => o.setName('creator').setDescription('Staff executor issuing this strike').setRequired(false)))
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
      .setDescription('Set ticket priority')
      .addStringOption(o => o.setName('level').setDescription('Priority level').setRequired(true)
        .addChoices({ name: 'None', value: 'none' }, { name: 'Low', value: 'low' }, { name: 'Medium', value: 'medium' }, { name: 'High', value: 'high' }, { name: 'Urgent', value: 'urgent' })))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  category: 'moderation',

  async execute(interaction, config, client) {
    const sub = interaction.options.getSubcommand();
    const startTime = Date.now();

    try {
      // ────────────────────────────────────────────
      // SETUP  (direct DB save, no validation)
      // ────────────────────────────────────────────
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

        // Build updates
        const updates = { ticketCategoryId: category.id };
        if (logChannel) updates.ticketLogChannelId = logChannel.id;
        if (closedCategory) updates.ticketClosedCategoryId = closedCategory.id;
        if (transcriptChannel) updates.ticketTranscriptChannelId = transcriptChannel.id;
        if (staffRole) updates.ticketStaffRoleId = staffRole.id;
        if (maxTickets) updates.maxTicketsPerUser = maxTickets;

        const configKey = `guild:${interaction.guildId}:config`;

        try {
          // Get existing raw config (or empty object)
          let current = {};
          try {
            const raw = await client.db.get(configKey, {});
            if (raw && typeof raw === 'object') current = raw;
          } catch (_) {}

          // Merge & save directly
          const merged = { ...current, ...updates };
          await client.db.set(configKey, merged);

          // Build success embed fields
          const fields = [{ name: '📁 Category', value: category.name, inline: true }];
          if (logChannel) fields.push({ name: '📋 Log Channel', value: `<#${logChannel.id}>`, inline: true });
          if (closedCategory) fields.push({ name: '🔒 Closed Category', value: closedCategory.name, inline: true });
          if (transcriptChannel) fields.push({ name: '📜 Transcript Channel', value: `<#${transcriptChannel.id}>`, inline: true });
          if (staffRole) fields.push({ name: '👥 Staff Role', value: `<@&${staffRole.id}>`, inline: true });
          if (maxTickets) fields.push({ name: '🎫 Max Tickets/User', value: String(maxTickets), inline: true });

          return interaction.reply({
            embeds: [createEmbed({
              title: '✅ Ticket System Configured',
              description: 'The ticket system is ready. Use `/ticket open`, `/ticket create`, or `/ticket strike`.',
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

      // ────────────────────────────────────────────
      // FOR OTHER COMMANDS: load config via getGuildConfig
      // (which now includes the ticket fields because we saved them)
      // ────────────────────────────────────────────
      let guildConfig;
      try {
        guildConfig = await getGuildConfig(client, interaction.guildId);
      } catch (e) {
        logger.error('[ticket] Failed to load guild config:', e);
        guildConfig = {}; // fallback
      }
      const categoryId = guildConfig.ticketCategoryId || null;
      const closedCategoryId = guildConfig.ticketClosedCategoryId || null;

      // Helper to require ticket system setup
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

      // ────────────────────────────────────────────
      // OPEN TICKET (self)
      // ────────────────────────────────────────────
      if (sub === 'open') {
        if (!requireSetup()) return;

        const max = guildConfig.maxTicketsPerUser ?? 3;
        const currentCount = await getUserTicketCount(interaction.guildId, interaction.user.id).catch(() => 0);
        if (currentCount >= max) {
          return interaction.reply({
            embeds: [errorEmbed('Ticket Limit Reached', `You have ${currentCount}/${max} open tickets.`)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const reason = interaction.options.getString('reason') || 'No reason provided';
        const priority = interaction.options.getString('priority') || 'none';

        // Rate limiting
        const allowed = await checkRateLimit(`${interaction.user.id}:create_ticket`, 3, 60000).catch(() => true);
        if (!allowed) {
          return interaction.reply({
            embeds: [errorEmbed('Rate Limited', 'You are creating tickets too quickly. Please wait a minute.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await createTicket(interaction.guild, interaction.member, categoryId, reason, priority);
        if (result.success) {
          await interaction.editReply({ embeds: [successEmbed('Ticket Created', `Your ticket has been created in ${result.channel}!`)] });
        } else {
          await interaction.editReply({ embeds: [errorEmbed('Error', result.error || 'Failed to create ticket.')] });
        }
      }

      // ────────────────────────────────────────────
      // CREATE TICKET (staff for others)
      // ────────────────────────────────────────────
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

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let targetMember;
        if (user) {
          targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
          if (!targetMember) {
            return interaction.editReply({ embeds: [errorEmbed('Error', 'Could not find that user in this server.')] });
          }
          // Check limit for target
          const max = guildConfig.maxTicketsPerUser ?? 3;
          const count = await getUserTicketCount(interaction.guildId, user.id).catch(() => 0);
          if (count >= max) {
            return interaction.editReply({ embeds: [errorEmbed('Ticket Limit Reached', `${user} has ${count}/${max} open tickets.`)] });
          }
        } else {
          targetMember = interaction.member; // role ticket → creator is the "owner"
        }

        let fullReason = reason;
        if (user && role) fullReason = `Ticket for ${user.tag} and role ${role.name}\nCreated by: ${interaction.user.tag}\nReason: ${reason}`;
        else if (user) fullReason = `Ticket for ${user.tag}\nCreated by: ${interaction.user.tag}\nReason: ${reason}`;
        else if (role) fullReason = `Role ticket for ${role.name}\nCreated by: ${interaction.user.tag}\nReason: ${reason}`;

        const result = await createTicket(interaction.guild, targetMember, categoryId, fullReason, priority);
        if (!result.success) {
          return interaction.editReply({ embeds: [errorEmbed('Error', result.error || 'Failed to create ticket.')] });
        }

        // Add role to ticket
        if (role) {
          await result.channel.permissionOverwrites.create(role, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
          }).catch(() => {});
        }
        // Add creator (staff) if not the ticket owner
        if (user && creator.id !== user.id) {
          await result.channel.permissionOverwrites.create(creator, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
          }).catch(() => {});
        }

        const embed = createEmbed({
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
        await result.channel.send({ embeds: [embed] });

        return interaction.editReply({ embeds: [successEmbed('Ticket Created', `Ticket created in ${result.channel}!`)] });
      }

      // ────────────────────────────────────────────
      // STRIKE
      // ────────────────────────────────────────────
      else if (sub === 'strike') {
        if (!requireSetup()) return;

        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const creator = interaction.options.getUser('creator') || interaction.user;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) {
          return interaction.editReply({ embeds: [errorEmbed('Error', 'Could not find that user in this server.')] });
        }

        const strikeReason = `⚠️ STRIKE ISSUED\n👤 User: ${user.tag}\n🛡️ Officer: ${creator.tag}\n📝 Reason: ${reason}`;
        const result = await createTicket(interaction.guild, targetMember, categoryId, strikeReason, 'high');

        if (!result.success) {
          return interaction.editReply({ embeds: [errorEmbed('Error', result.error || 'Failed to create strike ticket.')] });
        }

        if (creator.id !== user.id) {
          await result.channel.permissionOverwrites.create(creator, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
          }).catch(() => {});
        }

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
        await result.channel.send({ content: `${user}`, embeds: [strikeEmbed] });

        return interaction.editReply({ embeds: [successEmbed('Strike Ticket Created', `Strike tracking active in ${result.channel}`)] });
      }

      // ────────────────────────────────────────────
      // BRING
      // ────────────────────────────────────────────
      else if (sub === 'bring') {
        const targetUser = interaction.options.getUser('user');
        if (!isTicketChannel(interaction, categoryId, closedCategoryId)) {
          return interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'This command can only be used inside a ticket channel.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          await interaction.channel.permissionOverwrites.create(targetUser, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
          });
        } catch {
          await interaction.channel.permissionOverwrites.edit(targetUser, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
          }).catch(() => {});
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
        return interaction.editReply({ embeds: [successEmbed('User Added', `${targetUser} has been added.`)] });
      }

      // ────────────────────────────────────────────
      // REMOVE
      // ────────────────────────────────────────────
      else if (sub === 'remove') {
        const targetUser = interaction.options.getUser('user');
        if (!isTicketChannel(interaction, categoryId, closedCategoryId)) {
          return interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'This command can only be used inside a ticket channel.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const perms = {
          ViewChannel: false, SendMessages: false, ReadMessageHistory: false,
          AddReactions: false, AttachFiles: false, EmbedLinks: false,
        };
        try {
          await interaction.channel.permissionOverwrites.edit(targetUser, perms);
        } catch {
          await interaction.channel.permissionOverwrites.create(targetUser, perms).catch(() => {});
        }

        await interaction.channel.send({
          embeds: [createEmbed({
            title: '➖ User Removed',
            description: `${targetUser} has been removed from this ticket by ${interaction.user}.`,
            color: 'warning',
            timestamp: true,
          })],
        });
        return interaction.editReply({ embeds: [successEmbed('User Removed', `${targetUser} has been removed.`)] });
      }

      // ────────────────────────────────────────────
      // CLAIM
      // ────────────────────────────────────────────
      else if (sub === 'claim') {
        if (!isTicketChannel(interaction, categoryId, closedCategoryId)) {
          return interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'This command can only be used inside a ticket channel.')],
            flags: MessageFlags.Ephemeral,
          });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await claimTicket(interaction.channel, interaction.user);
        return interaction.editReply({
          embeds: result.success
            ? [successEmbed('Ticket Claimed', 'You have claimed this ticket!')]
            : [errorEmbed('Error', result.error || 'Failed to claim ticket.')],
        });
      }

      // ────────────────────────────────────────────
      // PRIORITY
      // ────────────────────────────────────────────
      else if (sub === 'priority') {
        if (!isTicketChannel(interaction, categoryId, closedCategoryId)) {
          return interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'This command can only be used inside a ticket channel.')],
            flags: MessageFlags.Ephemeral,
          });
        }
        const level = interaction.options.getString('level');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await updateTicketPriority(interaction.channel, level, interaction.user);
        return interaction.editReply({
          embeds: result.success
            ? [successEmbed('Priority Updated', `Ticket priority set to ${level}.`)]
            : [errorEmbed('Error', result.error || 'Failed to update priority.')],
        });
      }

    } catch (error) {
      logger.error(`[ticket] Unhandled error in /ticket ${sub}:`, error);
      await handleInteractionError(interaction, error, { subtype: `ticket_${sub}_failed` });
    }
  },
};