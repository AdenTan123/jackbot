import { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

/**
 * Constructs the bug report modal used by the /bug report command.
 *
 * @returns {ModalBuilder} The configured modal instance.
 */
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

/**
 * Interaction handler for the bug report modal submission.
 * The framework expects an exported object with `customId` and `execute`.
 */
export const bugReportModal = {
  customId: 'bugReportModal',
  async execute(interaction) {
    const description = interaction.fields.getTextInputValue('description');
    const reproduce = interaction.fields.getTextInputValue('reproduce');
    const device = interaction.fields.getTextInputValue('device');
    const extra = interaction.fields.getTextInputValue('extra');

    const { createEmbed } = await import('../../utils/embeds.js');
    const { InteractionHelper } = await import('../../utils/interactionHelper.js');
    const { MessageFlags } = await import('discord.js');

    const reportEmbed = createEmbed({
      title: '🐞 New Bug Report',
      description: `**Description:**\n${description}\n\n**Reproduce:**\n${reproduce}\n\n**Device:** ${device}\n\n**Extra:** ${extra || 'None'}`,
      color: 'warning',
    });

    const channelId = process.env.BUG_REPORT_CHANNEL_ID;
    const channel = interaction.client.channels.cache.get(channelId);
    if (channel) await channel.send({ embeds: [reportEmbed] });

    await InteractionHelper.safeReply(interaction, {
      content: 'Thank you! Your bug report has been submitted.',
      flags: MessageFlags.Ephemeral,
    });
  },
};
