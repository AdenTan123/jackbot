const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { queues, MusicQueue } = require('../../utils/MusicQueue');
const play = require('play-dl');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from YouTube')
    .addStringOption(opt =>
      opt.setName('query').setDescription('Song name or URL').setRequired(true)),

  async execute(interaction) {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) return interaction.reply({ content: '❌ Join a voice channel first!', ephemeral: true });

    await interaction.deferReply();
    const query = interaction.options.getString('query');

    let url;
    if (play.yt_validate(query) === 'video') {
      url = query;
    } else {
      const results = await play.search(query, { limit: 1 });
      if (!results.length) return interaction.editReply('❌ No results found.');
      url = results[0].url;
    }

    if (!queues.has(interaction.guildId)) queues.set(interaction.guildId, new MusicQueue());
    const queue = queues.get(interaction.guildId);

    const track = await queue.add(url, interaction.user.tag);
    const wasEmpty = queue.queue.length === 1;

    if (wasEmpty) {
      await queue.join(voiceChannel);
      const nowPlaying = await queue.playNext();
      return interaction.editReply({ embeds: [nowPlayingEmbed(nowPlaying)] });
    }

    return interaction.editReply({ embeds: [queuedEmbed(track, queue.queue.length - 1)] });
  }
};

function nowPlayingEmbed(track) {
  return new EmbedBuilder()
    .setColor(0x1DB954)
    .setTitle('🎵 Now Playing')
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields({ name: 'Duration', value: track.duration, inline: true }, { name: 'Requested by', value: track.requestedBy, inline: true })
    .setThumbnail(track.thumbnail);
}

function queuedEmbed(track, position) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 Added to Queue')
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields({ name: 'Position', value: `#${position}`, inline: true }, { name: 'Requested by', value: track.requestedBy, inline: true });
}