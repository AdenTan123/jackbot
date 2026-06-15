import { MessageFlags } from 'discord.js';
import { updateGuildConfig, getGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export const strikeMessageModal = {
  name: 'strikeMessageModal',

  async execute(interaction) {
    logger.info('strikeMessageModal.execute – template update received');
    
    try {
      const templateText = interaction.fields.getTextInputValue('templateInput').trim();
      const client = interaction.client;

      const existing = await getGuildConfig(client, interaction.guildId).catch(() => ({}));

      await updateGuildConfig(client, interaction.guildId, {
        ...existing,
        strikeMessageTemplate: templateText
      });

      await interaction.reply({
        content: '✅ **Strike template updated successfully!**\nAny future strike tickets will use your new formatting configuration.',
        flags: MessageFlags.Ephemeral,
      });
      
    } catch (error) {
      logger.error('strikeMessageModal.execute – failed to save template', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Failed to save your strike message template setup configuration.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    }
  },
};

export default strikeMessageModal;