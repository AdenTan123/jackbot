import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure bot settings for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View current bot configuration'))

    .addSubcommand(sub => sub
      .setName('modlog')
      .setDescription('Set the moderation log channel')
      .addChannelOption(o => o
        .setName('channel')
        .setDescription('Channel for moderation logs')
        .setRequired(true)))

    .addSubcommand(sub => sub
      .setName('ticketcategory')
      .setDescription('Set the ticket category')
      .addChannelOption(o => o
        .setName('category')
        .setDescription('Category for ticket channels')
        .setRequired(true)))

    .addSubcommand(sub => sub
      .setName('ticketlog')
      .setDescription('Set the ticket log channel')
      .addChannelOption(o => o
        .setName('channel')
        .setDescription('Channel for ticket logs')
        .setRequired(true)))

    .addSubcommand(sub => sub
      .setName('clear')
      .setDescription('Clear a specific config value')
      .addStringOption(o => o
        .setName('key')
        .setDescription('Config key to clear')
        .setRequired(true)
        .addChoices(
          { name: 'Mod Log Channel', value: 'modLogChannelId' },
          { name: 'Ticket Category', value: 'ticketCategoryId' },
          { name: 'Ticket Log Channel', value: 'ticketLogChannelId' },
        ))),

  category: 'admin',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    const sub = interaction.options.getSubcommand();

    try {
      const cfg = await getGuildConfig(client, interaction.guildId).catch(() => ({})) ?? {};

      // ── VIEW ───────────────────────────────────────────────
      if (sub === 'view') {
        const modLog = cfg.modLogChannelId ? `<#${cfg.modLogChannelId}>` : '❌ Not set';
        const ticketCat = cfg.ticketCategoryId
          ? (interaction.guild.channels.cache.get(cfg.ticketCategoryId)?.name ?? '⚠️ Channel not found')
          : '❌ Not set';
        const ticketLog = cfg.ticketLogChannelId ? `<#${cfg.ticketLogChannelId}>` : '❌ Not set';
        const loggingEnabled = cfg.logging?.enabled !== false ? '✅ Enabled' : '❌ Disabled';

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({
            title: `⚙️ Config — ${interaction.guild.name}`,
            color: 'info',
            fields: [
              { name: '📋 Mod Log Channel', value: modLog, inline: true },
              { name: '📝 Logging', value: loggingEnabled, inline: true },
              { name: '\u200b', value: '\u200b', inline: true },
              { name: '🎫 Ticket Category', value: ticketCat, inline: true },
              { name: '📋 Ticket Log Channel', value: ticketLog, inline: true },
              { name: '\u200b', value: '\u200b', inline: true },
            ],
            footer: { text: `Guild ID: ${interaction.guildId}` },
            timestamp: true,
          })],
        });
      }

      // ── MODLOG ─────────────────────────────────────────────
      if (sub === 'modlog') {
        const channel = interaction.options.getChannel('channel');
        await updateGuildConfig(client, interaction.guildId, {
          modLogChannelId: channel.id,
          logChannelId: channel.id,        // also set legacy key
          'logging.channelId': channel.id, // also set nested key
          logging: { ...(cfg.logging ?? {}), channelId: channel.id, enabled: true },
        });
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`Mod log channel set to <#${channel.id}>`, '✅ Config Updated')],
        });
      }

      // ── TICKET CATEGORY ────────────────────────────────────
      if (sub === 'ticketcategory') {
        const category = interaction.options.getChannel('category');
        if (category.type !== ChannelType.GuildCategory) {
          throw new Error('Please select a **category** channel, not a text or voice channel.');
        }
        await updateGuildConfig(client, interaction.guildId, { ticketCategoryId: category.id });
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`Ticket category set to **${category.name}**`, '✅ Config Updated')],
        });
      }

      // ── TICKET LOG ─────────────────────────────────────────
      if (sub === 'ticketlog') {
        const channel = interaction.options.getChannel('channel');
        await updateGuildConfig(client, interaction.guildId, { ticketLogChannelId: channel.id });
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`Ticket log channel set to <#${channel.id}>`, '✅ Config Updated')],
        });
      }

      // ── CLEAR ──────────────────────────────────────────────
      if (sub === 'clear') {
        const key = interaction.options.getString('key');
        await updateGuildConfig(client, interaction.guildId, { [key]: null });
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`Cleared config key \`${key}\`.`, '✅ Config Cleared')],
        });
      }

    } catch (error) {
      logger.error('Config command error:', error);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed(error.message || 'Failed to update config.')],
      });
    }
  },
};