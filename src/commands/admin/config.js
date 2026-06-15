import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChannelType, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder 
} from 'discord.js';
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
          { name: 'Strike Message Template', value: 'strikeMessageTemplate' },
        )))

    .addSubcommand(sub => sub
      .setName('counting')
      .setDescription('Setup a counting channel')
      .addStringOption(opt =>
        opt.setName('channelid')
          .setDescription('ID of the channel for counting')
          .setRequired(true))
      .addStringOption(opt =>
        opt.setName('deletenonwords')
          .setDescription('Delete messages that are not numbers or allowed math (Y/N)')
          .setRequired(true)
          .addChoices({ name: 'Yes', value: 'Y' }, { name: 'No', value: 'N' }))
      .addStringOption(opt =>
        opt.setName('math')
          .setDescription('Allow simple math expressions like "4+1" (Y/N)')
          .setRequired(true)
          .addChoices({ name: 'Yes', value: 'Y' }, { name: 'No', value: 'N' }))
    )
    .addSubcommand(sub => sub
      .setName('strikemessage')
      .setDescription('Set the custom message layout posted inside strike tickets')),

  category: 'admin',

  async execute(interaction, config, client) {
    const sub = interaction.options.getSubcommand();

    // ── STRIKE MESSAGE MODAL TRIGGER ───────────────────────
    // Must run BEFORE deferring the interaction, otherwise the modal will crash!
    if (sub === 'strikemessage') {
      try {
        const cfg = await getGuildConfig(client, interaction.guildId).catch(() => ({})) ?? {};
        const defaultTemplate = "⚠️ **STRIKE ISSUED**\n\n👤 **User:** {user}\n🛡️ **Staff:** {creator}\n📝 **Reason:** {reason}";
        const currentTemplate = cfg.strikeMessageTemplate || defaultTemplate;

        const modal = new ModalBuilder()
          .setCustomId('strikeMessageModal')
          .setTitle('Configure Strike Message');

        const templateInput = new TextInputBuilder()
          .setCustomId('templateInput')
          .setLabel('Message Layout Template')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Use placeholders: {user}, {creator}, {reason}')
          .setValue(currentTemplate)
          .setRequired(true)
          .setMaxLength(1500);

        const row = new ActionRowBuilder().addComponents(templateInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
        return;
      } catch (error) {
        logger.error('Error triggering strike message modal:', error);
        return;
      }
    }

    // Defer for all standard subcommands that don't open popups
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

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
        const strikeMsgSet = cfg.strikeMessageTemplate ? '✅ Configured Custom' : 'ℹ️ Using Default';

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({
            title: `⚙️ Config — ${interaction.guild.name}`,
            color: 'info',
            fields: [
              { name: '📋 Mod Log Channel', value: modLog, inline: true },
              { name: '📝 Logging', value: loggingEnabled, inline: true },
              { name: '⚡ Strike Layout', value: strikeMsgSet, inline: true },
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
          logChannelId: channel.id,        
          'logging.channelId': channel.id, 
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

      // ── COUNTING ───────────────────────────────────────────
      if (sub === 'counting') {
        const channelId = interaction.options.getString('channelid', true).trim();
        const deleteNonWords = interaction.options.getString('deletenonwords', true) === 'Y';
        const allowMath = interaction.options.getString('math', true) === 'Y';

        const guildConfig = await getGuildConfig(client, interaction.guildId).catch(() => ({}));
        const updated = { ...guildConfig };
        updated.counting = {
          channelId,
          deleteNonWords,
          allowMath,
          lastNumber: 0,
          lastUserId: null,
        };

        await updateGuildConfig(client, interaction.guildId, updated);
        logger.info('Counting config saved', { guildId: interaction.guildId, channelId, deleteNonWords, allowMath });

        const embed = successEmbed('✅ Counting channel configured');
        embed.addFields({ name: 'Channel', value: `<#${channelId}>`, inline: true });
        embed.addFields({ name: 'Delete non‑words', value: deleteNonWords ? 'Yes' : 'No', inline: true });
        embed.addFields({ name: 'Allow math', value: allowMath ? 'Yes' : 'No', inline: true });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

    } catch (error) {
      logger.error('Config command error:', error);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed(error.message || 'Failed to update config.')],
      });
    }
  },
};