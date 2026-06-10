import {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import play from 'play-dl';
import { logger } from './logger.js';

export const queues = new Map();

export function getOrCreateQueue(guildId) {
  if (!queues.has(guildId)) queues.set(guildId, new MusicQueue(guildId));
  return queues.get(guildId);
}

class MusicQueue {
  constructor(guildId) {
    this.guildId = guildId;
    this.tracks = [];
    this.isPlaying = false;
    this.player = createAudioPlayer();
    this.connection = null;
    this.volume = 1;
    this.resource = null;

    this.player.on('error', error => {
      logger.error(`Audio player error in guild ${guildId}:`, error);
    });
  }

  async join(voiceChannel) {
    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.stop();
        queues.delete(this.guildId);
      }
    });

    this.connection.subscribe(this.player);
  }

  async add(query, user) {
    let url;
    if (play.yt_validate(query) === 'video') {
      url = query;
    } else {
      const results = await play.search(query, { limit: 1 });
      if (!results.length) throw new Error(`No results found for: **${query}**`);
      url = results[0].url;
    }

    const info = await play.video_info(url);
    const track = {
      title: info.video_details.title,
      url,
      duration: info.video_details.durationRaw,
      thumbnail: info.video_details.thumbnails?.[0]?.url ?? null,
      requestedBy: user,
    };

    this.tracks.push(track);
    return track;
  }

  async playNext(client) {
    if (!this.tracks.length) {
      this.isPlaying = false;
      setTimeout(() => {
        if (!this.tracks.length) {
          this.connection?.destroy();
          queues.delete(this.guildId);
        }
      }, 30_000);
      return;
    }

    this.isPlaying = true;
    const track = this.tracks[0];

    try {
      const stream = await play.stream(track.url);
      this.resource = createAudioResource(stream.stream, {
        inputType: stream.type,
        inlineVolume: true,
      });
      this.resource.volume?.setVolume(this.volume);
      this.player.play(this.resource);

      this.player.once(AudioPlayerStatus.Idle, () => {
        this.tracks.shift();
        this.playNext(client);
      });
    } catch (error) {
      logger.error(`Failed to play track "${track.title}":`, error);
      this.tracks.shift();
      this.playNext(client);
    }
  }

  nowPlaying() { return this.tracks[0] ?? null; }
  skip() { this.player.stop(); }
  pause() { this.player.pause(); }
  resume() { this.player.unpause(); }
  setVolume(level) {
    this.volume = level;
    this.resource?.volume?.setVolume(level);
  }
  stop() {
    this.tracks = [];
    this.isPlaying = false;
    this.player.stop();
    this.connection?.destroy();
  }
}