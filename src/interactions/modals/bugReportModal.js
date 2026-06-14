import { MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  // Providing all three variants to ensure the interaction loader accepts it
  id: 'bugReportModal',
  name: 'bugReportModal',
  customId: 'bugReportModal',
  
  async execute(interaction) {
    logger.info('bugReportModal.execute – received submission');
    try {
      const description = interaction.fields.getTextInputValue('description');
      const reproduce = interaction.fields.getTextInputValue('reproduce');
      const device = interaction.fields.getTextInputValue('device');
      const extra = interaction.fields.getTextInputValue('extra');

      const reportEmbed = createEmbed({
        title: '🐞 New Bug Report',
        description: `**Description:**\n${description}\n\n**Reproduce:**\n${reproduce}\n\n**Device:** ${device}\n\n**Extra:** ${extra || 'None'}`,
        color: 'warning',
      });

      const channelId = process.env.BUG_REPORT_CHANNEL_ID;
      const channel = interaction.client.channels.cache.get(channelId);
      
      if (channel) {
        await channel.send({ embeds: [reportEmbed] });
      } else {
        logger.warn('Bug report channel not found', { channelId });
      }

      await InteractionHelper.safeReply(interaction, {
        content: 'Thank you! Your bug report has been submitted.',
        flags: MessageFlags.Ephemeral,
      });
      
    } catch (error) {
      logger.error('bugReportModal.execute – error', { error });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ An internal error occurred while processing your report. Please try again later.',
          ephemeral: true,
        }).catch(() => null);
      }
    }
  },
};