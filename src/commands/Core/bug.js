import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createBugReportModal } from '../../interactions/modals/bugReportModal.js';

export default {
  data: new SlashCommandBuilder()
    .setName('bug')
    .setDescription('Bug reporting utilities')
    .addSubcommand(sub =>
      sub.setName('report').setDescription('Open a bug report modal'))
    .addSubcommand(sub =>
      sub.setName('view').setDescription('View bug reports (owner only)')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'report') {
      const modal = createBugReportModal();
      await interaction.showModal(modal);
      return;
    }

    if (sub === 'view') {
      const ownerIds = (process.env.OWNER_IDS || '').split(',').map(id => id.trim());
      if (!ownerIds.includes(interaction.user.id)) {
        const denyEmbed = createEmbed({
          title: '❌ Access Denied',
          description: 'Only the bot owner can view bug reports.',
          color: 'error',
        });
        await InteractionHelper.safeReply(interaction, { embeds: [denyEmbed] });
        return;
      }
      const viewEmbed = createEmbed({
        title: '🛠️ Bug Reports',
        description: 'Bug report viewing is not yet implemented.',
        color: 'info',
      });
      await InteractionHelper.safeReply(interaction, { embeds: [viewEmbed] });
    }
  },

  // Forward modal submissions to the handler defined in the modal file
  async modalSubmit(interaction) {
    const { bugReportModal } = await import('../../interactions/modals/bugReportModal.js');
    if (bugReportModal && typeof bugReportModal.execute === 'function') {
      await bugReportModal.execute(interaction);
    }
  },
};
