import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { queues } from '../../utils/musicQueue.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current song'),
  category: 'music',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const queue = queues.get(interaction.guildId);
      if (!queue?.isPlaying) throw new Error('Nothing is currently playing.');

      queue.pause();
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Playback paused. Use `/resume` to continue.', '⏸️ Paused')],
      });
    } catch (error) {
      logger.error('Pause command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'pause_failed' });
    }
  },
};