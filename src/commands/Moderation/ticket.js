import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, OverwriteType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

const CATEGORY_ID = '1514526048430198895';

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket management')

    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a ticket for a user')
      .addUserOption(o => o.setName('user').setDescription('User the ticket is for').setRequired(true))
      .addUserOption(o => o.setName('creator').setDescription('Person creating/assigned to the ticket (optional)'))
      .addStringOption(o => o.setName('reason').setDescription('Reason for the ticket (optional)')))

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

      // ── CREATE ──────────────────────────────────────────────
      if (sub === 'create') {
        const user = interaction.options.getUser('user');
        const creator = interaction.options.getUser('creator') || interaction.user;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const category = interaction.guild.channels.cache.get(CATEGORY_ID);
        if (!category) throw new Error(`Category \`${CATEGORY_ID}\` not found. Please check the category ID.`);

        // Sanitize username for channel name
        const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
        const channelName = `ticket-${safeName}`;

        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: CATEGORY_ID,
          permissionOverwrites: [
            {
              // deny everyone by default
              id: interaction.guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              // ticket subject user
              id: user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
            {
              // ticket creator
              id: creator.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
            {
              // bot itself
              id: client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
              ],
            },
          ],
        });

        const embed = createEmbed({
          title: '🎫 Personal Ticket',
          description: `This is a personal ticket for <@${user.id}> with <@${creator.id}>`,
          color: 'info',
          fields: [
            { name: '👤 User', value: `<@${user.id}>`, inline: true },
            { name: '🙋 Created by', value: `<@${creator.id}>`, inline: true },
            { name: '📝 Reason', value: reason, inline: false },
          ],
          footer: { text: `Use /ticket delete to close this ticket` },
          timestamp: true,
        });

        await ticketChannel.send({
          content: `<@${user.id}> <@${creator.id}>`,
          embeds: [embed],
        });

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            `Ticket created for <@${user.id}>: <#${ticketChannel.id}>`,
            '✅ Ticket Created'
          )],
        });
      }

      // ── BRING ───────────────────────────────────────────────
      else if (sub === 'bring') {
        if (!interaction.channel.name.startsWith('ticket-')) {
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

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            `<@${user.id}> has been added to the ticket.`,
            '✅ User Added'
          )],
        });
      }

      // ── REMOVE ──────────────────────────────────────────────
      else if (sub === 'remove') {
        if (!interaction.channel.name.startsWith('ticket-')) {
          throw new Error('This command can only be used inside a ticket channel.');
        }

        const user = interaction.options.getUser('user');

        await interaction.channel.permissionOverwrites.create(user.id, {
          ViewChannel: false,
          SendMessages: false,
          ReadMessageHistory: false,
        });

        await interaction.channel.send({
          embeds: [createEmbed({
            title: '➖ User Removed',
            description: `<@${user.id}> has been removed from this ticket by <@${interaction.user.id}>.`,
            color: 'warning',
            timestamp: true,
          })],
        });

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            `<@${user.id}> has been removed from the ticket.`,
            '✅ User Removed'
          )],
        });
      }

      // ── DELETE ──────────────────────────────────────────────
      else if (sub === 'delete') {
        if (!interaction.channel.name.startsWith('ticket-')) {
          throw new Error('This command can only be used inside a ticket channel.');
        }

        await interaction.channel.send({
          embeds: [createEmbed({
            title: '🗑️ Ticket Closing',
            description: `This ticket is being deleted by <@${interaction.user.id}>.\nChannel will be deleted in **5 seconds**.`,
            color: 'error',
            timestamp: true,
          })],
        });

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Ticket will be deleted in 5 seconds.', '🗑️ Deleting Ticket')],
        });

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