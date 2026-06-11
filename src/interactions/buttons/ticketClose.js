import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export default {
  name: 'ticket_close',

  async execute(interaction, client, args) {
    try {
      const creatorId = args[0]; // passed from customId split

      const canClose =
        interaction.user.id === creatorId ||
        interaction.member.permissions.has('ManageChannels');

      if (!canClose) {
        return interaction.reply({
          embeds: [createEmbed({
            title: '❌ No Permission',
            description: 'Only the ticket creator or a moderator can close this ticket.',
            color: 'error',
            timestamp: true,
          })],
          ephemeral: true,
        });
      }

      await interaction.reply({
        embeds: [createEmbed({
          title: '🔒 Ticket Closing',
          description: `Ticket closed by <@${interaction.user.id}>.\nChannel will be deleted in **5 seconds**.`,
          color: 'error',
          timestamp: true,
        })],
      });

      setTimeout(async () => {
        try {
          await interaction.channel.delete(`Ticket closed by ${interaction.user.tag}`);
        } catch (err) {
          logger.error('Failed to delete ticket channel from button:', err);
        }
      }, 5000);

    } catch (error) {
      logger.error('Ticket close button error:', error);
    }
  },
};