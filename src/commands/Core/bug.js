import { SlashCommandBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('bug')
    .setDescription('Bug reporting utilities')
    .addSubcommand(sub =>
      sub.setName('report').setDescription('Open a bug report modal')),
   

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'report') {
      const modal = new ModalBuilder()
        .setCustomId('bugReportModal')
        .setTitle('Bug Report');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('description').setLabel('Describe the bug').setStyle(TextInputStyle.Paragraph).setPlaceholder('What went wrong?').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('reproduce').setLabel('Steps to Reproduce').setStyle(TextInputStyle.Paragraph).setPlaceholder('1. …\n2. …').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('device').setLabel('Device / Platform').setStyle(TextInputStyle.Short).setPlaceholder('e.g., Windows 10, Android, etc.').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('extra').setLabel('Additional Information').setStyle(TextInputStyle.Paragraph).setPlaceholder('Any logs, screenshots, etc.').setRequired(false)
        )
      );

      await interaction.showModal(modal);
      return;
    }

   
  }
};