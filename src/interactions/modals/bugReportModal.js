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
