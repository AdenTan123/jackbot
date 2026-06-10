import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { distube } from '../../utils/musicQueue.js';

export default {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume paused playback'),
  category: 'music',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;
    try {
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) throw new Error('Nothing is paused.');
      if (!queue.paused) throw new Error('Playback is not paused.');
      distube.resume(interaction.guildId);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Playback resumed.', '▶️ Resumed')],
      });
    } catch (error) {
      logger.error('Resume command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'resume_failed' });
    }
  },
};