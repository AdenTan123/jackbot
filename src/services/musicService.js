import { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior, AudioPlayerStatus, getVoiceConnection } from '@discordjs/voice';
import play from 'play-dl';
import { logger } from '../utils/logger.js';

const guildMusicStates = new Map();

function getGuildState(guildId) {
  if (!guildMusicStates.has(guildId)) {
    guildMusicStates.set(guildId, {
      queue: [],
      current: null,
      player: null,
      playing: false
    });
  }
  return guildMusicStates.get(guildId);
}

function cleanupGuildState(guildId) {
  const state = guildMusicStates.get(guildId);
  if (state) {
    if (state.player) {
      try {
        state.player.stop();
      } catch (error) {
        logger.debug(`Failed to stop player during cleanup for guild ${guildId}:`, error?.message || error);
      }
    }
    const connection = getVoiceConnection(guildId);
    if (connection) {
      try {
        connection.destroy();
      } catch (error) {
        logger.debug(`Failed to destroy voice connection during cleanup for guild ${guildId}:`, error?.message || error);
      }
    }
    guildMusicStates.delete(guildId);
  }
}

class MusicService {
  static async ensureConnection(member) {
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) {
      throw new Error('You must be in a voice channel to use music commands.');
    }

    let connection = getVoiceConnection(voiceChannel.guild.id);
    if (!connection) {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });
      logger.info(`Joined voice channel ${voiceChannel.id} in guild ${voiceChannel.guild.id}`);
    }

    return connection;
  }

  static async enqueue(guildId, query, user) {
    const state = getGuildState(guildId);
    const track = {
      query,
      requester: user.tag,
      requesterId: user.id,
      requestedAt: new Date().toISOString(),
      title: query
    };
    state.queue.push(track);
    return track;
  }

  static getQueue(guildId) {
    const state = getGuildState(guildId);
    return [...state.queue];
  }

  static getCurrentTrack(guildId) {
    const state = getGuildState(guildId);
    return state.current;
  }

  static isPlaying(guildId) {
    const state = getGuildState(guildId);
    return state.playing;
  }

  static async playNext(guildId) {
    const state = getGuildState(guildId);

    if (state.queue.length === 0) {
      logger.info(`Queue empty for guild ${guildId}, cleaning up voice connection`);
      state.current = null;
      state.playing = false;
      if (state.player) {
        try {
          state.player.stop();
        } catch (error) {}
        state.player = null;
      }
      const connection = getVoiceConnection(guildId);
      if (connection) {
        connection.destroy();
      }
      return null;
    }

    const nextTrack = state.queue.shift();
    const connection = getVoiceConnection(guildId);
    if (!connection) {
      throw new Error('No active voice connection. Rejoin the voice channel and try again.');
    }

    let streamInfo;
    try {
      if (/^https?:\/\//i.test(nextTrack.query)) {
        streamInfo = await play.stream(nextTrack.query);
      } else {
        const results = await play.search(nextTrack.query, { limit: 1 });
        if (!results || results.length === 0) {
          throw new Error(`No results found for: ${nextTrack.query}`);
        }
        nextTrack.title = results[0].title || nextTrack.query;
        streamInfo = await play.stream(results[0].url);
      }
    } catch (error) {
      logger.error(`Failed to resolve stream for ${nextTrack.query}:`, error?.message || error);
      throw new Error(`Unable to play track: ${error?.message || 'stream resolution failed'}`);
    }

    if (!streamInfo || !streamInfo.stream) {
      throw new Error('Failed to obtain stream from play-dl.');
    }

    const resource = createAudioResource(streamInfo.stream, {
      inputType: streamInfo.type
    });

    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause
      }
    });

    player.play(resource);
    state.player = player;
    state.current = nextTrack;
    state.playing = true;

    player.on('error', error => {
      logger.error(`Audio player error in guild ${guildId}:`, error);
    });

    player.on(AudioPlayerStatus.Idle, async () => {
      logger.info(`Track finished in guild ${guildId}. Playing next track if available.`);
      try {
        await MusicService.playNext(guildId);
      } catch (error) {
        logger.error(`Failed to play next track for guild ${guildId}:`, error?.message || error);
      }
    });

    connection.subscribe(player);
    logger.info(`Now playing in guild ${guildId}: ${nextTrack.title}`);

    return nextTrack;
  }

  static async tryStart(guildId, member) {
    await MusicService.ensureConnection(member);
    const state = getGuildState(guildId);
    if (state.playing || state.current) {
      return state.current;
    }
    return await MusicService.playNext(guildId);
  }

  static stop(guildId) {
    cleanupGuildState(guildId);
  }

  static skip(guildId) {
    const state = getGuildState(guildId);
    if (!state.player) {
      return false;
    }
    const stopped = state.player.stop();
    if (stopped) {
      logger.info(`Skipped current track in guild ${guildId}`);
    }
    return !!stopped;
  }
}

export default MusicService;
