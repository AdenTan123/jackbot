import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_BASE = process.env.MARIZMA_BASE_URL || 'https://maple-api.marizma.games/v1';

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure Marizma API integration for this server (opens secure modal)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!InteractionHelper.isInteractionValid(interaction)) return;

    try {
      const modal = new ModalBuilder().setCustomId('marizma_setup_modal').setTitle('Marizma Setup');

      const apiInput = new TextInputBuilder()
        .setCustomId('marizma_api_key')
        .setLabel('Marizma API Key')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Enter your Marizma API key');

      const baseInput = new TextInputBuilder()
        .setCustomId('marizma_base_url')
        .setLabel('Base URL (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder(DEFAULT_BASE);

      const rolesInput = new TextInputBuilder()
        .setCustomId('marizma_allowed_roles')
        .setLabel('Allowed roles (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Comma-separated role IDs or mentions');

      modal.addComponents(new ActionRowBuilder().addComponents(apiInput));
      modal.addComponents(new ActionRowBuilder().addComponents(baseInput));
      modal.addComponents(new ActionRowBuilder().addComponents(rolesInput));

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Error showing setup modal:', error);
      await InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Could not open setup modal', error)], flags: MessageFlags.Ephemeral });
    }
  }
};
