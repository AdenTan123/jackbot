import { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_BASE = process.env.MARIZMA_BASE_URL || 'https://maple-api.marizma.games/v1';

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure Marizma API integration and session settings for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName('marizma')
      .setDescription('Configure Marizma API key, banner, and session settings'))
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View current Marizma configuration for this server')),

  async execute(interaction, config, client) {
    if (!InteractionHelper.isInteractionValid(interaction)) return;

    // Safely get subcommand — old cached command may not have subcommands yet
    let sub;
    try {
      sub = interaction.options.getSubcommand();
    } catch {
      sub = 'marizma';
    }

    try {

      // ── VIEW ───────────────────────────────────────────────
      if (sub === 'view') {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        const cfg = await getGuildConfig(client, interaction.guildId).catch(() => ({}));
        const m = cfg?.marizma ?? {};

        const maskedKey = m.apiKey
          ? `${String(m.apiKey).slice(0, 3)}${'*'.repeat(Math.max(0, String(m.apiKey).length - 6))}${String(m.apiKey).slice(-3)}`
          : '❌ Not set';

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({
            title: `⚙️ Marizma Config — ${interaction.guild.name}`,
            color: 'info',
            fields: [
              { name: '🔑 API Key', value: maskedKey, inline: true },
              { name: '🌐 Base URL', value: m.baseUrl || DEFAULT_BASE, inline: true },
              { name: '📢 Announce Channel', value: m.announceChannelId ? `<#${m.announceChannelId}>` : '❌ Not set', inline: true },
              { name: '🔒 Allowed Roles', value: m.allowedRoles?.length ? m.allowedRoles.map(r => `<@&${r}>`).join(', ') : 'All roles', inline: false },
              {
                name: '🎫 Banner Template',
                value: m.bannerTemplate
                  ? `\`\`\`${m.bannerTemplate.slice(0, 200)}\`\`\``
                  : '❌ Not set — run `/setup marizma` to configure',
                inline: false,
              },
              { name: '📋 Session Embed Title', value: m.sessionTitle || '❌ Not set', inline: true },
              {
                name: '📝 Session Body',
                value: m.sessionBody
                  ? `${m.sessionBody.slice(0, 150)}${m.sessionBody.length > 150 ? '...' : ''}`
                  : '❌ Not set',
                inline: false,
              },
              {
                name: '📣 SSU Message',
                value: m.ssuMessage
                  ? `${m.ssuMessage.slice(0, 150)}${m.ssuMessage.length > 150 ? '...' : ''}`
                  : '❌ Not set',
                inline: false,
              },
              {
                name: '💡 Available Placeholders',
                value: '`{host}` `{cohost}` `{code}` `{link}` `{role}`',
                inline: false,
              },
            ],
            footer: { text: 'Run /setup marizma to edit' },
            timestamp: true,
          })],
        });
      }

      // ── MARIZMA SETUP ──────────────────────────────────────
      if (sub === 'marizma') {
        const cfg = await getGuildConfig(client, interaction.guildId).catch(() => ({}));
        const m = cfg?.marizma ?? {};

        const modal = new ModalBuilder()
          .setCustomId('marizma_setup_step1')
          .setTitle('Marizma Setup (1/2) — API & Roles');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('marizma_api_key')
              .setLabel('Marizma API Key')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(m.apiKey || '')
              .setPlaceholder('Enter your Marizma API key')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('marizma_base_url')
              .setLabel('Base URL (optional)')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(m.baseUrl || '')
              .setPlaceholder(DEFAULT_BASE)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('marizma_announce_channel')
              .setLabel('Announce Channel ID')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(m.announceChannelId || '')
              .setPlaceholder('Channel ID for SSU announcements')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('marizma_allowed_roles')
              .setLabel('Allowed Role IDs (optional, comma separated)')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(m.allowedRoles?.join(', ') || '')
              .setPlaceholder('123456789, 987654321')
          )
        );

        await interaction.showModal(modal);
      }

    } catch (error) {
      logger.error('Setup command error:', error);
      try {
        await InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Could not open setup modal.', error)],
          flags: MessageFlags.Ephemeral,
        });
      } catch {}
    }
  }
};