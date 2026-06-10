import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { distube } from '../../utils/musicQueue.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from YouTube')
    .addStringOption(o =>
      o.setName('query').setDescription('Song name or YouTube URL').setRequired(true)),
  category: 'music',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel) throw new Error('You need to be in a voice channel first.');

      const query = interaction.options.getString('query');

      distube.once('playSong', async (queue, song) => {
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({
            title: '🎵 Now Playing',
            description: `**[${song.name}](${song.url})**`,
            color: 'success',
            fields: [
              { name: '⏱️ Duration', value: song.formattedDuration, inline: true },
              { name: '👤 Requested by', value: `${interaction.user}`, inline: true },
            ],
            thumbnail: song.thumbnail,
            timestamp: true,
          })],
        });
      });

      distube.once('addSong', async (queue, song) => {
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({
            title: '📋 Added to Queue',
            description: `**[${song.name}](${song.url})**`,
            color: 'info',
            fields: [
              { name: '⏱️ Duration', value: song.formattedDuration, inline: true },
              { name: '📌 Position', value: `#${queue.songs.length - 1}`, inline: true },
              { name: '👤 Requested by', value: `${interaction.user}`, inline: true },
            ],
            thumbnail: song.thumbnail,
            timestamp: true,
          })],
        });
      });

      await distube.play(voiceChannel, query, {
        member: interaction.member,
        textChannel: interaction.channel,
      });

    } catch (error) {
      logger.error('Play command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'play_failed' });
    }
  },
};