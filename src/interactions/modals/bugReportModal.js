import { EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const bugReportModal = {
  name: 'bugReportModal',

  async execute(interaction) {
    logger.info('bugReportModal.execute – received submission');
    
    try {
      const fields = interaction.fields;

      const description = (fields.fields.get('description')?.value || fields.fields.get('bug_description')?.value || '').trim();
      const reproduce = (fields.fields.get('reproduce')?.value || fields.fields.get('bug_reproduce')?.value || '').trim();
      const device = (fields.fields.get('device')?.value || fields.fields.get('bug_device')?.value || '').trim();
      const extra = (fields.fields.get('extra')?.value || fields.fields.get('bug_extra')?.value || 'None').trim();

      const reportEmbed = new EmbedBuilder()
        .setTitle('🐞 New Bug Report')
        .setDescription(`**Description:**\n${description || 'Not provided'}\n\n**Reproduce:**\n${reproduce || 'Not provided'}\n\n**Device:** ${device || 'Not provided'}\n\n**Extra:** ${extra}`)
        .setColor(0xff9900);

      const client = interaction.client;
      const channelId = process.env.BUG_REPORT_CHANNEL_ID;
      
      if (!channelId) {
        throw new Error('BUG_REPORT_CHANNEL_ID is missing from your environment variables (.env)');
      }

      // Safely fetch the channel
      const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
      
      if (!channel) {
        throw new Error(`Could not find any channel with ID "${channelId}". Please check your .env file.`);
      }

      // 🛑 THE FIX: Verify this is a text channel we can actually send a message to
      if (!channel.isTextBased()) {
        throw new Error(`Channel "${channel.name}" (ID: ${channelId}) is a ${channel.type} channel. It must be a regular text channel to receive bug reports.`);
      }

      await channel.send({ embeds: [reportEmbed] });
      logger.info(`Bug report sent successfully to channel ${channelId}`);

      await interaction.reply({
        content: 'Thank you! Your bug report has been submitted.',
        flags: MessageFlags.Ephemeral,
      });
      
    } catch (error) {
      logger.error('bugReportModal.execute – error details:', {
        message: error.message,
        stack: error.stack
      });

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `❌ **Submission Failed**\n*Details: ${error.message}*`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    }
  },
};

export default bugReportModal;