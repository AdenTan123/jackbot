import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { distube } from '../../utils/musicQueue.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop music and clear the queue'),
  category: 'music',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;
    try {
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) throw new Error('Nothing is currently playing.');
      if (!interaction.member.voice.channel) throw new Error('You need to be in a voice channel.');
      await distube.stop(interaction.guildId);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Stopped playback and cleared the queue.', '⏹️ Stopped')],
      });
    } catch (error) {
      logger.error('Stop command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'stop_failed' });
    }
  },
};