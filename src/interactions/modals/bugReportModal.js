import { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export function createBugReportModal() {
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

  return modal;
}

export const bugReportModal = {
  customId: 'bugReportModal',
  async execute(interaction) {
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
      
      // Fallback to fetch if the channel isn't cached yet
      const channel = interaction.client.channels.cache.get(channelId) 
        || await interaction.client.channels.fetch(channelId).catch(() => null);

      if (channel) {
        await channel.send({ embeds: [reportEmbed] }).catch(err => {
          console.error("❌ Failed to send embed to bug channel:", err);
        });
      } else {
        console.warn(`⚠️ Bug report channel with ID ${channelId} could not be found.`);
      }

      await InteractionHelper.safeReply(interaction, {
        content: 'Thank you! Your bug report has been submitted for review.',
        flags: [MessageFlags.Ephemeral], // Wrapped in an array for standard compliance
      });

    } catch (error) {
      console.error("❌ Error handling bugReportModal submission:", error);
      
      // Attempt a safe emergency reply if everything else errors out
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An internal error occurred while processing your report.',
          ephemeral: true
        }).catch(() => null);
      }
    }
  },
};