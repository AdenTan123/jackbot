import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { distube } from '../../utils/musicQueue.js';

export default {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song'),
  category: 'music',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;
    try {
      const queue = distube.getQueue(interaction.guildId);
      if (!queue) throw new Error('Nothing is currently playing.');
      if (!interaction.member.voice.channel) throw new Error('You need to be in a voice channel.');
      const skipped = queue.songs[0];
      await distube.skip(interaction.guildId);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(`Skipped **${skipped.name}**`, '⏭️ Skipped')],
      });
    } catch (error) {
      logger.error('Skip command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'skip_failed' });
    }
  },
};