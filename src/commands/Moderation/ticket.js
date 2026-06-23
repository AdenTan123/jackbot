import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { createTicket, getUserTicketCount } from '../../services/ticket.js';
import { checkRateLimit } from '../../utils/rateLimiter.js';

// ─── Hardcoded Configurations ───
const TICKET_CATEGORY_ID = '1514526048430198895';
const TICKET_LOG_CHANNEL_ID = '1514528044801327147';
const MAX_TICKETS_PER_USER = 3;

// Helper to check if we’re inside a ticket channel
function inTicketChannel(interaction) {
  return interaction.channel && interaction.channel.parentId === TICKET_CATEGORY_ID;
}

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system')
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
         .setRequired(false)))
    // ── /ticket open (self) ──
    .addSubcommand(sub => sub
      .setName('open')
      .setDescription('Create your own ticket')
      .addStringOption(o =>
        o.setName('reason')
         .setDescription('Reason for the ticket')
         .setRequired(false)))
    // ── Management Subcommands ──
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
      .setName('close')
      .setDescription('Close and delete this ticket channel permanently'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  category: 'moderation',

  async execute(interaction, config, client) {
    const sub = interaction.options.getSubcommand();

    try {
      // ─────────────────────────────────────────────
      //  /ticket open  (self‑creation)
      // ─────────────────────────────────────────────
      if (sub === 'open') {
        const currentCount = await getUserTicketCount(interaction.guildId, interaction.user.id).catch(() => 0);
        if (currentCount >= MAX_TICKETS_PER_USER) {
          return interaction.reply({
            embeds: [errorEmbed('Ticket Limit', `You have ${currentCount}/${MAX_TICKETS_PER_USER} open tickets.`)],
            flags: MessageFlags.Ephemeral,
          });
        }

        // Rate limiting
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

        const result = await createTicket(interaction.guild, interaction.member, TICKET_CATEGORY_ID, reason);
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
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        const creator = interaction.options.getUser('creator') || interaction.user;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!user && !role) {
          return interaction.reply({
            embeds: [errorEmbed('Missing Target', 'You must provide either a user or a role.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) return;

        let targetMember;
        if (user) {
          targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
          if (!targetMember) {
            return InteractionHelper.safeEditReply(interaction, {
              embeds: [errorEmbed('Error', 'Could not find that user in this server.')],
            });
          }

          const currentCount = await getUserTicketCount(interaction.guildId, user.id).catch(() => 0);
          if (currentCount >= MAX_TICKETS_PER_USER) {
            return InteractionHelper.safeEditReply(interaction, {
              embeds: [errorEmbed('Ticket Limit', `${user} has ${currentCount}/${MAX_TICKETS_PER_USER} open tickets.`)],
            });
          }
        } else {
          targetMember = interaction.member;
        }

        let fullReason = reason;
        if (user && role) fullReason = `Ticket for ${user.tag} and role ${role.name}\nStaff: ${interaction.user.tag}\nReason: ${reason}`;
        else if (user)    fullReason = `Ticket for ${user.tag}\nStaff: ${interaction.user.tag}\nReason: ${reason}`;
        else if (role)    fullReason = `Role ticket for ${role.name}\nStaff: ${interaction.user.tag}\nReason: ${reason}`;

        const result = await createTicket(interaction.guild, targetMember, TICKET_CATEGORY_ID, fullReason);
        if (!result.success) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Error', result.error || 'Failed to create ticket.')],
          });
        }

        if (role) {
          await result.channel.permissionOverwrites.create(role, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
          }).catch(() => {});
        }

        if (user && creator.id !== user.id) {
          await result.channel.permissionOverwrites.create(creator, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
          }).catch(() => {});
        }

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
      //  MANAGEMENT COMMANDS (In-channel only)
      // ─────────────────────────────────────────────
      if (['bring', 'remove', 'claim', 'close'].includes(sub)) {
        if (!inTicketChannel(interaction)) {
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

        if (sub === 'close') {
          const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
          if (!deferSuccess) return;

          // Dispatch audit log before deleting channel
          const logChannel = interaction.guild.channels.cache.get(TICKET_LOG_CHANNEL_ID);
          if (logChannel) {
            const logEmbed = createEmbed({
              title: '🔒 Ticket Closed & Deleted',
              description: `Ticket channel **#${interaction.channel.name}** was deleted by ${interaction.user}.`,
              color: 'danger',
              timestamp: true,
            });
            await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
          }

          await interaction.channel.delete(`Closed by ${interaction.user.tag}`).catch(() => {});
          return;
        }
      }

    } catch (error) {
      logger.error(`[ticket] Unhandled error in /ticket ${sub}:`, error);
      await handleInteractionError(interaction, error, { subtype: `ticket_${sub}_failed` });
    }
  },
};