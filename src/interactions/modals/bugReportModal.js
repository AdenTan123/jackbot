import { EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const bugReportModal = {
  name: 'bugReportModal',

  async execute(interaction) {
    logger.info('bugReportModal.execute – received submission');
    
    try {
      const fields = interaction.fields;

      // Safe extraction: If custom IDs don't match perfectly, this handles it gracefully instead of crashing
      const description = (fields.fields.get('description')?.value || fields.fields.get('bug_description')?.value || '').trim();
      const reproduce = (fields.fields.get('reproduce')?.value || fields.fields.get('bug_reproduce')?.value || '').trim();
      const device = (fields.fields.get('device')?.value || fields.fields.get('bug_device')?.value || '').trim();
      const extra = (fields.fields.get('extra')?.value || fields.fields.get('bug_extra')?.value || 'None').trim();

      // Build the embed using standard Discord.js methods (exactly like your marizma script)
      const reportEmbed = new EmbedBuilder()
        .setTitle('🐞 New Bug Report')
        .setDescription(`**Description:**\n${description || 'Not provided'}\n\n**Reproduce:**\n${reproduce || 'Not provided'}\n\n**Device:** ${device || 'Not provided'}\n\n**Extra:** ${extra}`)
        .setColor(0xff9900); // Amber warning color

      const client = interaction.client;
      const channelId = process.env.BUG_REPORT_CHANNEL_ID;
      
      if (!channelId) {
        throw new Error('BUG_REPORT_CHANNEL_ID is missing from your environment variables (.env)');
      }

      // Fetch or get the channel safely
      const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
      
      if (channel) {
        await channel.send({ embeds: [reportEmbed] });
        logger.info(`Bug report sent successfully to channel ${channelId}`);
      } else {
        logger.warn(`Bug report channel (${channelId}) could not be located.`);
      }

      // Pure discord.js interaction response
      await interaction.reply({
        content: 'Thank you! Your bug report has been submitted.',
        flags: MessageFlags.Ephemeral,
      });
      
    } catch (error) {
      // Force print the actual error message and stack trace to the console
      logger.error('bugReportModal.execute – critical error details:', {
        message: error.message,
        stack: error.stack
      });
      console.error(error); 

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `❌ An internal error occurred.\n*Details: ${error.message}*`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    }
  },
};

export default bugReportModal;