const { createAudioPlayer, createAudioResource, AudioPlayerStatus, joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const play = require('play-dl');

class MusicQueue {
  constructor() {
    this.queue = [];
    this.playing = false;
    this.player = createAudioPlayer();
    this.connection = null;
    this.volume = 1;
  }

  async join(channel) {
    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });
    this.connection.subscribe(this.player);
  }

  async add(url, requestedBy) {
    const info = await play.video_info(url);
    const track = {
      title: info.video_details.title,
      url,
      requestedBy,
      duration: info.video_details.durationRaw,
      thumbnail: info.video_details.thumbnails[0]?.url,
    };
    this.queue.push(track);
    return track;
  }

  async playNext() {
    if (this.queue.length === 0) {
      this.playing = false;
      this.connection?.destroy();
      return;
    }
    this.playing = true;
    const track = this.queue[0];
    const stream = await play.stream(track.url);
    const resource = createAudioResource(stream.stream, { inputType: stream.type });
    this.player.play(resource);
    this.player.once(AudioPlayerStatus.Idle, () => {
      this.queue.shift();
      this.playNext();
    });
    return track;
  }

  skip() { this.player.stop(); }
  pause() { this.player.pause(); }
  resume() { this.player.unpause(); }
  stop() { this.queue = []; this.player.stop(); this.connection?.destroy(); }
  nowPlaying() { return this.queue[0] || null; }
}

const queues = new Map();
module.exports = { queues, MusicQueue };

this.connection.on(VoiceConnectionStatus.Disconnected, () => {
  queues.delete(guildId);
});