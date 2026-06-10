import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, infoEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { distube } from '../../utils/musicQueue.js';

export default {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current music queue'),
  category: 'music',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;
    try {
      const queue = distube.getQueue(interaction.guildId);
      if (!queue?.songs.length) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [infoEmbed('The queue is empty. Use `/play` to add songs.', '📭 Empty Queue')],
        });
      }
      const list = queue.songs.map((s, i) =>
        `${i === 0 ? '🎵' : `\`${i}.\``} **[${s.name}](${s.url})** — ${s.formattedDuration} — <@${s.user?.id ?? 'Unknown'}>`
      ).join('\n');

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({
          title: '📋 Music Queue',
          description: list,
          color: 'info',
          footer: { text: `${queue.songs.length} track${queue.songs.length !== 1 ? 's' : ''} in queue` },
          timestamp: true,
        })],
      });
    } catch (error) {
      logger.error('Queue command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'queue_failed' });
    }
  },
};