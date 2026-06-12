import { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import { updateGuildConfig, getGuildConfig } from '../../../services/guildConfig.js';
import { logger } from '../../../utils/logger.js';

export default {
  name: 'marizma_setup_step1',

  async execute(interaction, client) {
    try {
      const apiKey = interaction.fields.getTextInputValue('marizma_api_key').trim();
      const baseUrl = interaction.fields.getTextInputValue('marizma_base_url').trim() || null;
      const announceChannelRaw = interaction.fields.getTextInputValue('marizma_announce_channel').trim() || null;
      const rolesRaw = interaction.fields.getTextInputValue('marizma_allowed_roles').trim() || '';

      const allowedRoles = rolesRaw
        .split(/[\s,]+/)
        .map(s => s.replace(/[<@&>]/g, '').trim())
        .filter(s => /^\d{17,19}$/.test(s));

      const announceChannelId = announceChannelRaw?.replace(/[^0-9]/g, '') || null;

      const existing = await getGuildConfig(client, interaction.guildId).catch(() => ({}));
      const existingMarizma = existing?.marizma ?? {};

      await updateGuildConfig(client, interaction.guildId, {
        marizma: {
          ...existingMarizma,
          apiKey,
          ...(baseUrl ? { baseUrl } : {}),
          ...(announceChannelId ? { announceChannelId } : {}),
          ...(allowedRoles.length ? { allowedRoles } : {}),
        },
      });

      // Open step 2
      const modal2 = new ModalBuilder()
        .setCustomId('marizma_setup_step2')
        .setTitle('Marizma Setup (2/2) — Session Config');

      modal2.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('marizma_banner_template')
            .setLabel('Server Banner Template')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setValue(existingMarizma.bannerTemplate || '')
            .setPlaceholder(
              'Use {host} = host name, {cohost} = co-host name.\nExample: ✙ Welcome! Hosted by {host} & {cohost} ✙'
            )
            .setMaxLength(512)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('marizma_session_title')
            .setLabel('Session Embed Title')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(existingMarizma.sessionTitle || '')
            .setPlaceholder('e.g. 🏥 Server Start Up!')
            .setMaxLength(100)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('marizma_session_body')
            .setLabel('Session Embed Body')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setValue(existingMarizma.sessionBody || '')
            .setPlaceholder(
              'Placeholders: {host} {cohost} {code} {link}\nExample: Host: {host}\nCohost: {cohost}\nCode: {code}'
            )
            .setMaxLength(1500)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('marizma_ssu_message')
            .setLabel('SSU Announcement Message')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setValue(existingMarizma.ssuMessage || '')
            .setPlaceholder(
              'Placeholders: {host} {cohost} {code} {link} {role}\nExample: # Server Start Up!\n{role}\nHost: {host}\nCode: {code}'
            )
            .setMaxLength(1500)
        )
      );

      await interaction.showModal(modal2);

    } catch (error) {
      logger.error('Marizma setup step 1 modal error:', error);
      try {
        await interaction.reply({
          content: '❌ Failed to save API config. Please try again.',
          flags: MessageFlags.Ephemeral,
        });
      } catch {}
    }
  }
};