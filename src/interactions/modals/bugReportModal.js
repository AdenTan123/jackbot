import { MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  // We use exactly and ONLY 'name', perfectly matching your customId in bug.js
  name: 'bugReportModal',

  async execute(interaction, client) {
    logger.info('bugReportModal.execute – received submission');
    
    try {
      // Collect the fields
      const description = interaction.fields.getTextInputValue('description').trim();
      const reproduce = interaction.fields.getTextInputValue('reproduce').trim();
      const device = interaction.fields.getTextInputValue('device').trim();
      
      // 'extra' is not required, so we handle if it's blank
      const extraRaw = interaction.fields.getTextInputValue('extra');
      const extra = extraRaw ? extraRaw.trim() : 'None';

      const reportEmbed = createEmbed({
        title: '🐞 New Bug Report',
        description: `**Description:**\n${description}\n\n**Reproduce:**\n${reproduce}\n\n**Device:** ${device}\n\n**Extra:** ${extra}`,
        color: 'warning',
      });

      // Get the channel using the client object passed by your framework
      const channelId = process.env.BUG_REPORT_CHANNEL_ID;
      const channel = client.channels.cache.get(channelId);
      
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
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    }
  },
};