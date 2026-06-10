import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, infoEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { distube } from '../../utils/musicQueue.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing song'),
  category: 'music',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;
    try {
      const queue = distube.getQueue(interaction.guildId);
      const song = queue?.songs[0];
      if (!song) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [infoEmbed('Nothing is currently playing.', '🎵 Now Playing')],
        });
      }
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({
          title: '🎵 Now Playing',
          description: `**[${song.name}](${song.url})**`,
          color: 'info',
          thumbnail: song.thumbnail,
          fields: [
            { name: '⏱️ Duration', value: song.formattedDuration, inline: true },
            { name: '👤 Requested by', value: `<@${song.user?.id ?? 'Unknown'}>`, inline: true },
          ],
          timestamp: true,
        })],
      });
    } catch (error) {
      logger.error('Nowplaying command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'nowplaying_failed' });
    }
  },
};