import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setupmodal')
    .setDescription('Open a modal to configure Marizma (safer API key entry)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!InteractionHelper.isInteractionValid(interaction)) return;

    const deferred = await InteractionHelper.safeDefer(interaction, { flags: 1 << 6 });
    if (!deferred) return;

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
        .setPlaceholder('https://maple-api.marizma.games/v1');

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
      logger.error('Failed to show Marizma setup modal:', error);
      await InteractionHelper.safeReply(interaction, { content: 'Could not open setup modal.', flags: 1 << 6 });
    }
  }
};
