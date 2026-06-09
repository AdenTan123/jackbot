import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';
import MusicService from '../../services/musicService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Music playback controls (basic)')
    .addSubcommand(s => s.setName('play').setDescription('Queue a track').addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)))
    .addSubcommand(s => s.setName('stop').setDescription('Stop playback and clear queue'))
    .addSubcommand(s => s.setName('admin').setDescription('Open the admin music panel')),

  async execute(interaction) {
    const ok = await InteractionHelper.safeDefer(interaction);
    if (!ok) return;

    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      const cfg = await getGuildConfig(interaction.client, guildId).catch(() => null);
      if (!cfg) {
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('Config Unavailable', 'Could not load server config. Please try again.')]
        });
      }

      const music = cfg.music || { queue: [], volume: 100, playing: false };

      if (sub === 'play') {
        const query = interaction.options.getString('query', true).trim();
        music.queue = music.queue || [];
        music.queue.push({ requester: interaction.user.id, query, addedAt: new Date().toISOString() });
        await updateGuildConfig(interaction.client, guildId, { music }).catch(() => {});

        // Reply immediately — don't await background playback
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Queued', `Added **${query}** to the queue.`)]
        });

        // Fix: fire-and-forget with no further interaction calls
        const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          MusicService.ensureConnection(guild, interaction.member)
            .then(() => MusicService.playNext(guild, interaction.client))
            .catch(e => logger.debug('Background music start failed', e?.message || e));
        }

        return;
      }

      if (sub === 'stop') {
        music.queue = [];
        music.playing = false;
        await updateGuildConfig(interaction.client, guildId, { music }).catch(() => {});
        try { MusicService.stop(guildId); } catch (e) {}
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Stopped', 'Playback stopped and queue cleared.')]
        });
      }

      if (sub === 'admin') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Missing Permissions', 'You need **Manage Guild** to use this.')]
          });
        }

        const queue = music.queue || [];
        const panel = createEmbed({
          title: '🎵 Music Admin Panel',
          description: [
            `**Status:** ${music.playing ? '▶️ Playing' : '⏹️ Stopped'}`,
            `**Volume:** ${music.volume ?? 100}%`,
            `**Queue:** ${queue.length} track${queue.length !== 1 ? 's' : ''}`,
            queue.length > 0 ? `**Next:** ${queue[0].query}` : ''
          ].filter(Boolean).join('\n')
        });

        const row = InteractionHelper.buildActionRow(
          InteractionHelper.buildButton('music_admin:play', '▶️ Play', 'Primary'),
          InteractionHelper.buildButton('music_admin:stop', '⏹️ Stop', 'Danger'),
          InteractionHelper.buildButton('music_admin:queue', '📋 Queue', 'Secondary'),
          InteractionHelper.buildButton('music_admin:refresh', '🔄 Refresh', 'Secondary')
        );

        return await InteractionHelper.safeEditReply(interaction, { embeds: [panel], components: [row] });
      }

      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed('Unknown subcommand')]
      });
    } catch (error) {
      logger.error('Music command error', error);
      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed('Command failed', error.message || String(error))]
      });
    }
  }
};