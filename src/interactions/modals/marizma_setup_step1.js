import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';

import { updateGuildConfig, getGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
  name: 'marizma_setup_step1',

  async execute(interaction, client) {
    try {
      const apiKey = interaction.fields.getTextInputValue('marizma_api_key').trim();

      const baseUrl =
        interaction.fields.getTextInputValue('marizma_base_url').trim() || null;

      const announceChannelRaw =
        interaction.fields.getTextInputValue('marizma_announce_channel').trim() || null;

      const rolesRaw =
        interaction.fields.getTextInputValue('marizma_allowed_roles').trim() || '';

      const allowedRoles = rolesRaw
        .split(/[\s,]+/)
        .map((s) => s.replace(/[<@&>]/g, '').trim())
        .filter((s) => /^\d{17,19}$/.test(s));

      const announceChannelId =
        announceChannelRaw?.replace(/[^0-9]/g, '') || null;

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

      const embed = new EmbedBuilder()
        .setTitle('Setup Complete (1/2)')
        .setDescription('Step 1 saved successfully. Continue to Step 2.')
        .setColor(0x00ae86);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('marizma_open_step2')
          .setLabel('Continue Setup')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });

    } catch (error) {
      logger.error(error);
      if (!interaction.replied) {
        await interaction.reply({
          content: '❌ Failed Step 1 setup.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};