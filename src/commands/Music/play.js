import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getOrCreateQueue, queues } from '../../utils/musicQueue.js';

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

      const botMember = interaction.guild.members.me;
      const perms = voiceChannel.permissionsFor(botMember);
      if (!perms.has('Connect') || !perms.has('Speak'))
        throw new Error('I need **Connect** and **Speak** permissions in your voice channel.');

      const query = interaction.options.getString('query');
      const queue = getOrCreateQueue(interaction.guildId);

      const track = await queue.add(query, interaction.user);
      const wasEmpty = queue.tracks.length === 1;

      if (wasEmpty) {
        await queue.join(voiceChannel);
        await queue.playNext(client);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [nowPlayingEmbed(track)],
        });
      } else {
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [queuedEmbed(track, queue.tracks.length - 1)],
        });
      }
    } catch (error) {
      logger.error('Play command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'play_failed' });
    }
  },
};

function nowPlayingEmbed(track) {
  return createEmbed({
    title: '🎵 Now Playing',
    description: `**[${track.title}](${track.url})**`,
    color: 'success',
    fields: [
      { name: '⏱️ Duration', value: track.duration, inline: true },
      { name: '👤 Requested by', value: `${track.requestedBy}`, inline: true },
    ],
    thumbnail: track.thumbnail,
    timestamp: true,
  });
}

function queuedEmbed(track, position) {
  return createEmbed({
    title: '📋 Added to Queue',
    description: `**[${track.title}](${track.url})**`,
    color: 'info',
    fields: [
      { name: '⏱️ Duration', value: track.duration, inline: true },
      { name: '📌 Position', value: `#${position}`, inline: true },
      { name: '👤 Requested by', value: `${track.requestedBy}`, inline: true },
    ],
    thumbnail: track.thumbnail,
    timestamp: true,
  });
}