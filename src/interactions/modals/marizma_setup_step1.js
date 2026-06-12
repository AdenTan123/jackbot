import {
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from 'discord.js';

import { updateGuildConfig, getGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
  name: 'marizma_setup_step1',

  async execute(interaction, client) {
    try {
      logger.info('=== MARIZMA STEP 1 START ===');
      logger.info(`Custom ID: ${interaction.customId}`);
      logger.info(`Guild ID: ${interaction.guildId}`);
      logger.info(`Is Modal Submit: ${interaction.isModalSubmit?.()}`);

      const apiKey = interaction.fields.getTextInputValue('marizma_api_key').trim();
      logger.info('Retrieved API key');

      const baseUrl =
        interaction.fields.getTextInputValue('marizma_base_url').trim() || null;

      const announceChannelRaw =
        interaction.fields.getTextInputValue('marizma_announce_channel').trim() || null;

      const rolesRaw =
        interaction.fields.getTextInputValue('marizma_allowed_roles').trim() || '';

      logger.info('Retrieved modal fields');

      const allowedRoles = rolesRaw
        .split(/[\s,]+/)
        .map((s) => s.replace(/[<@&>]/g, '').trim())
        .filter((s) => /^\d{17,19}$/.test(s));

      const announceChannelId =
        announceChannelRaw?.replace(/[^0-9]/g, '') || null;

      logger.info(
        `Parsed ${allowedRoles.length} role(s), announce channel: ${
          announceChannelId ?? 'none'
        }`
      );

      logger.info('Loading existing guild config...');

      const existing = await getGuildConfig(
        client,
        interaction.guildId
      ).catch((err) => {
        logger.error('getGuildConfig failed:', err);
        return {};
      });

      logger.info('Successfully loaded guild config');

      const existingMarizma = existing?.marizma ?? {};

      logger.info('Updating guild config...');

      await updateGuildConfig(client, interaction.guildId, {
        marizma: {
          ...existingMarizma,
          apiKey,
          ...(baseUrl ? { baseUrl } : {}),
          ...(announceChannelId ? { announceChannelId } : {}),
          ...(allowedRoles.length ? { allowedRoles } : {}),
        },
      });

      logger.info('Guild config updated successfully');

      logger.info('Building step 2 modal...');

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

      logger.info('Step 2 modal built successfully');
      logger.info('Attempting to show step 2 modal...');

      await interaction.showModal(modal2);

      logger.info('Step 2 modal shown successfully');
      logger.info('=== MARIZMA STEP 1 END ===');

    } catch (error) {
      logger.error('=== MARIZMA STEP 1 ERROR ===');
      logger.error(error);

      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ Failed to save API config. Please try again.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  },
};