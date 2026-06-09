import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import MusicService from '../../services/musicService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Music playback commands')
    .addSubcommand(sub =>
      sub
        .setName('play')
        .setDescription('Queue a song or play a URL')
        .addStringOption(option => option.setName('query').setDescription('Song name or URL').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('stop')
        .setDescription('Stop playback and clear the queue')
    )
    .addSubcommand(sub =>
      sub
        .setName('skip')
        .setDescription('Skip the current track')
    )
    .addSubcommand(sub =>
      sub
        .setName('queue')
        .setDescription('Show the current queue')
    )
    .addSubcommand(sub =>
      sub
        .setName('now')
        .setDescription('Show the currently playing track')
    ),

  async execute(interaction) {
    const ok = await InteractionHelper.safeDefer(interaction);
    if (!ok) return;

    try {
      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'play') {
        const query = interaction.options.getString('query', true).trim();
        await MusicService.enqueue(guildId, query, interaction.user);

        let startedTrack = null;
        try {
          startedTrack = await MusicService.tryStart(guildId, interaction.member);
        } catch (error) {
          logger.error('Music playback start failed:', error);
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Playback failed', error.message || String(error))]
          });
        }

        if (startedTrack && startedTrack.query.toLowerCase() === query.toLowerCase()) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(`Now playing: ${startedTrack.title}`)]
          });
        }

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`Queued: ${query}`)]
        });
      }

      if (subcommand === 'stop') {
        MusicService.stop(guildId);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Stopped playback and cleared the queue.')]
        });
      }

      if (subcommand === 'skip') {
        const skipped = MusicService.skip(guildId);
        if (!skipped) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Nothing is currently playing.')]
          });
        }
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Skipped the current track.')]
        });
      }

      if (subcommand === 'queue') {
        const queue = MusicService.getQueue(guildId);
        if (!queue.length) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: 'Queue', description: 'The queue is currently empty.' })]
          });
        }

        const lines = queue.map((track, index) => `${index + 1}. ${track.title || track.query} (requested by <@${track.requesterId}>)`);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({ title: 'Current Queue', description: lines.join('\n') })]
        });
      }

      if (subcommand === 'now') {
        const current = MusicService.getCurrentTrack(guildId);
        if (!current) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: 'Now Playing', description: 'Nothing is currently playing.' })]
          });
        }

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({ title: 'Now Playing', description: `${current.title || current.query} (requested by <@${current.requesterId}>)` })]
        });
      }

      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed('Invalid /music subcommand.')] 
      });
    } catch (error) {
      logger.error('Music command error:', error);
      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed('Music command failed', error.message || String(error))]
      });
    }
  }
};
