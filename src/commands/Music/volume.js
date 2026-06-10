import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { queues } from '../../utils/musicQueue.js';

export default {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the playback volume (1-100)')
    .addIntegerOption(o =>
      o.setName('level').setDescription('Volume level 1-100').setRequired(true)
        .setMinValue(1).setMaxValue(100)),
  category: 'music',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const queue = queues.get(interaction.guildId);
      if (!queue?.isPlaying) throw new Error('Nothing is currently playing.');

      const level = interaction.options.getInteger('level');
      queue.setVolume(level / 100);

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(`Volume set to **${level}%**`, '🔊 Volume')],
      });
    } catch (error) {
      logger.error('Volume command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'volume_failed' });
    }
  },
};