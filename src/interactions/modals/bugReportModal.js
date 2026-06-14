import { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import { Logger } from '../../utils/logger.js'; 
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

/**
 * Constructs the bug report modal used by the /bug report command.
 *
 * @returns {ModalBuilder} The configured modal instance.
 */
export function createBugReportModal() {
  Logger.info('createBugReportModal – building modal');
  const modal = new ModalBuilder()
    .setCustomId('bugReportModal')
    .setTitle('Bug Report');

  const description = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Describe the bug')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('What went wrong?')
    .setRequired(true);

  const reproduce = new TextInputBuilder()
    .setCustomId('reproduce')
    .setLabel('Steps to Reproduce')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('1. …\n2. …')
    .setRequired(true);

  const device = new TextInputBuilder()
    .setCustomId('device')
    .setLabel('Device / Platform')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., Windows 10, Android, etc.')
    .setRequired(true);

  const extra = new TextInputBuilder()
    .setCustomId('extra')
    .setLabel('Additional Information')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Any logs, screenshots, etc.')
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(description),
    new ActionRowBuilder().addComponents(reproduce),
    new ActionRowBuilder().addComponents(device),
    new ActionRowBuilder().addComponents(extra)
  );

  Logger.info('createBugReportModal – modal built');
  return modal;
}

/**
 * Interaction handler for the bug report modal submission.
 * The framework expects an exported object with `customId` and `execute`.
 */
export const bugReportModal = {
  customId: 'bugReportModal',
  async execute(interaction) {
    Logger.info('bugReportModal.execute – received submission');
    try {
      const description = interaction.fields.getTextInputValue('description');
      const reproduce = interaction.fields.getTextInputValue('reproduce');
      const device = interaction.fields.getTextInputValue('device');
      const extra = interaction.fields.getTextInputValue('extra');

      Logger.debug('Collected fields', { description, reproduce, device, extra });

      const reportEmbed = createEmbed({
        title: '🐞 New Bug Report',
        description: `**Description:**\n${description}\n\n**Reproduce:**\n${reproduce}\n\n**Device:** ${device}\n\n**Extra:** ${extra || 'None'}`,
        color: 'warning',
      });
      Logger.info('Report embed created');

      const channelId = process.env.BUG_REPORT_CHANNEL_ID;
      Logger.debug('Bug report channel ID from env', { channelId });
      
      const channel = interaction.client.channels.cache.get(channelId);
      if (channel) {
        await channel.send({ embeds: [reportEmbed] });
        Logger.info('Report embed sent to channel');
      } else {
        Logger.warn('Bug report channel not found or not cached', { channelId });
      }

      await InteractionHelper.safeReply(interaction, {
        content: 'Thank you! Your bug report has been submitted.',
        flags: MessageFlags.Ephemeral,
      });
      Logger.info('User acknowledged with ephemeral reply');
    } catch (error) {
      Logger.error('bugReportModal.execute – error processing submission', { error });
      // If we haven't already replied, send an error message
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ An internal error occurred while processing your report. Please try again later.',
          ephemeral: true,
        }).catch(() => null);
      }
    }
  },
};