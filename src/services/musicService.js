import { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior, AudioPlayerStatus, getVoiceConnection } from '@discordjs/voice';
import play from 'play-dl';
import { logger } from '../utils/logger.js';
import { getGuildConfig, updateGuildConfig } from './guildConfig.js';

const players = new Map();

class MusicService {
  static async ensureConnection(guild, member) {
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) throw new Error('You must be in a voice channel');

    let conn = getVoiceConnection(guild.id);
    if (!conn) {
      conn = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false
      });
      logger.info(`Joined voice channel ${voiceChannel.id} in guild ${guild.id}`);
    }
    return conn;
  }

  static async playNext(guild, client) {
    try {
      const cfg = await getGuildConfig(client, guild.id).catch(() => ({}));
      const music = cfg.music || { queue: [] };
      const next = (music.queue || []).shift();
      await updateGuildConfig(client, guild.id, { music }).catch(() => {});
      if (!next) {
        // no track
        const conn = getVoiceConnection(guild.id);
        if (conn) conn.destroy();
        players.delete(guild.id);
        return null;
      }

      // resolve query to a playable URL
      let streamInfo;
      if (/^https?:\/\//.test(next.query)) {
        logger.debug(`Attempting to stream URL: ${next.query}`);
        streamInfo = await play.stream(next.query).catch(err => {
          logger.error(`Failed to stream URL ${next.query}:`, err.message);
          return null;
        });
      } else {
        logger.debug(`Searching for: ${next.query}`);
        const results = await play.search(next.query, { limit: 1 }).catch(err => {
          logger.error(`Search failed for ${next.query}:`, err.message);
          return [];
        });
        if (!results || results.length === 0) {
          throw new Error(`No results found for "${next.query}"`);
        }
        logger.debug(`Found result: ${results[0].title} (${results[0].url})`);
        streamInfo = await play.stream(results[0].url).catch(err => {
          logger.error(`Failed to stream search result:`, err.message);
          return null;
        });
      }

      if (!streamInfo) throw new Error('Failed to create audio stream for ' + next.query);

      logger.debug(`Creating audio resource with type: ${streamInfo.type}`);
      const resource = createAudioResource(streamInfo.stream, { inputType: streamInfo.type });
      const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });

      player.play(resource);
      logger.info(`Playing: ${next.query} (requester: ${next.requester})`);

      player.on('error', error => {
        logger.error('Audio player error:', error);
      });

      player.on(AudioPlayerStatus.Idle, () => {
        logger.debug('Track finished, playing next...');
        // play next recursively
        setImmediate(() => MusicService.playNext(guild, client));
      });

      const conn = getVoiceConnection(guild.id);
      if (!conn) {
        logger.warn('No voice connection available, cannot subscribe player');
        return next;
      }
      conn.subscribe(player);
      players.set(guild.id, { player, current: next });
      logger.debug(`Player subscribed for guild ${guild.id}`);

      return next;
    } catch (error) {
      logger.error('MusicService.playNext failed', error);
      return null;
    }
  }

  static stop(guildId) {
    const conn = getVoiceConnection(guildId);
    if (conn) conn.destroy();
    players.delete(guildId);
  }

  static getQueue(musicCfg) {
    return (musicCfg?.queue || []).slice(0, 100);
  }
}

export default MusicService;
