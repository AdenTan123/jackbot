import { createEmbed, infoEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
  name: 'music_admin',
  async execute(interaction, client, args) {
    try {
      const action = args[0]; // play | stop | queue
      const guildId = interaction.guildId;
      const cfg = await getGuildConfig(client, guildId).catch(() => ({}));
      const music = cfg.music || { queue: [], volume: 100, playing: false };

      if (action === 'play') {
        // Start playback stub: pop next and announce
        const next = (music.queue || []).shift();
        if (!next) {
          return interaction.reply({ embeds: [infoEmbed('Queue Empty', 'There are no tracks queued.')], ephemeral: true });
        }
        music.playing = true;
        await updateGuildConfig(client, guildId, { music }).catch(() => {});
        return interaction.reply({ embeds: [successEmbed('Now Playing', `${next.query} — requested by <@${next.requester}>`)], ephemeral: true });
      }

      if (action === 'stop') {
        music.queue = [];
        music.playing = false;
        await updateGuildConfig(client, guildId, { music }).catch(() => {});
        return interaction.reply({ embeds: [successEmbed('Stopped', 'Playback stopped and queue cleared.')], ephemeral: true });
      }

      if (action === 'queue') {
        const q = (music.queue || []).slice(0, 25);
        if (q.length === 0) return interaction.reply({ embeds: [infoEmbed('Queue', 'No items in queue.')], ephemeral: true });
        const desc = q.map((t, i) => `${i+1}. ${t.query} — <@${t.requester}>`).join('\n');
        return interaction.reply({ embeds: [createEmbed({ title: `Queue (${music.queue.length})`, description: desc })], ephemeral: true });
      }

      return interaction.reply({ embeds: [errorEmbed('Unknown action')], ephemeral: true });
    } catch (error) {
      logger.error('music_admin button handler error', error);
      return interaction.reply({ embeds: [errorEmbed('Error', 'Failed to handle music admin action')], ephemeral: true });
    }
  }
};
