/**
 * MusicService - Manages per-guild music queues and voice connections.
 * Uses @discordjs/voice + play-dl for streaming.
 */

import {
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    NoSubscriberBehavior,
} from '@discordjs/voice';
import playdl from 'play-dl';
import { logger } from '../utils/logger.js';

/** @type {Map<string, GuildQueue>} */
const queues = new Map();

/**
 * @typedef {Object} Track
 * @property {string} title
 * @property {string} url
 * @property {string} duration   - formatted "mm:ss"
 * @property {string} thumbnail
 * @property {string} requesterId
 * @property {string} requesterTag
 */

class GuildQueue {
    constructor(guildId) {
        this.guildId = guildId;
        /** @type {Track[]} */
        this.tracks = [];
        this.currentTrack = null;
        this.connection = null;
        this.player = null;
        this.volume = 0.5;
        this.startedAt = null;  // Date when current track started
        this._setupPlayer();
    }

    _setupPlayer() {
        this.player = createAudioPlayer({
            behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
        });

        this.player.on(AudioPlayerStatus.Idle, () => {
            this._playNext();
        });

        this.player.on('error', (error) => {
            logger.error(`[MusicService] AudioPlayer error in guild ${this.guildId}:`, error);
            this._playNext();
        });
    }

    async _playNext() {
        if (this.tracks.length === 0) {
            this.currentTrack = null;
            this.startedAt = null;
            // Disconnect after 30s of inactivity
            setTimeout(() => {
                if (this.player.state.status === AudioPlayerStatus.Idle) {
                    this.destroy();
                }
            }, 30_000);
            return;
        }

        const track = this.tracks.shift();
        this.currentTrack = track;
        this.startedAt = Date.now();

        try {
            const stream = await playdl.stream(track.url, { quality: 2 });
            const resource = createAudioResource(stream.stream, {
                inputType: stream.type,
                inlineVolume: true,
            });
            resource.volume?.setVolume(this.volume);
            this.player.play(resource);
        } catch (error) {
            logger.error(`[MusicService] Failed to stream track "${track.title}":`, error);
            this._playNext(); // skip broken track
        }
    }

    destroy() {
        try {
            this.player?.stop(true);
            this.connection?.destroy();
        } catch (_) {}
        queues.delete(this.guildId);
    }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const MusicService = {
    /**
     * Get or create the queue for a guild.
     * @param {string} guildId
     * @returns {GuildQueue}
     */
    _getQueue(guildId) {
        if (!queues.has(guildId)) {
            queues.set(guildId, new GuildQueue(guildId));
        }
        return queues.get(guildId);
    },

    /**
     * Search for a track and return its info.
     * @param {string} query
     * @returns {Promise<Track|null>}
     */
    async search(query) {
        try {
            let videoInfo;
            // If it looks like a URL, stream it directly
            if (/^https?:\/\//i.test(query)) {
                const info = await playdl.video_info(query);
                videoInfo = info.video_details;
            } else {
                const results = await playdl.search(query, {
                    source: { youtube: 'video' },
                    limit: 1,
                });
                if (!results || results.length === 0) return null;
                videoInfo = results[0];
            }

            const durationSecs = videoInfo.durationInSec ?? 0;
            const mins = Math.floor(durationSecs / 60);
            const secs = String(durationSecs % 60).padStart(2, '0');

            return {
                title: videoInfo.title ?? 'Unknown Title',
                url: videoInfo.url,
                duration: durationSecs > 0 ? `${mins}:${secs}` : 'Live',
                thumbnail: videoInfo.thumbnails?.[0]?.url ?? null,
                requesterId: null,
                requesterTag: null,
            };
        } catch (error) {
            logger.error('[MusicService] Search error:', error);
            return null;
        }
    },

    /**
     * Join a voice channel and connect to the queue.
     * @param {import('discord.js').VoiceBasedChannel} channel
     * @returns {GuildQueue}
     */
    async join(channel) {
        const queue = this._getQueue(channel.guild.id);

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        } catch {
            connection.destroy();
            throw new Error('Could not connect to the voice channel in time.');
        }

        queue.connection = connection;
        connection.subscribe(queue.player);

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch {
                queue.destroy();
            }
        });

        return queue;
    },

    /**
     * Add a track to the queue and start playback if idle.
     * @param {string} guildId
     * @param {Track} track
     */
    async addTrack(guildId, track) {
        const queue = this._getQueue(guildId);
        queue.tracks.push(track);

        if (queue.player.state.status === AudioPlayerStatus.Idle && !queue.currentTrack) {
            await queue._playNext();
        }
    },

    /** @param {string} guildId */
    stop(guildId) {
        const queue = queues.get(guildId);
        if (!queue) return false;
        queue.tracks = [];
        queue.destroy();
        return true;
    },

    /** @param {string} guildId */
    skip(guildId) {
        const queue = queues.get(guildId);
        if (!queue || !queue.currentTrack) return false;
        queue.player.stop(); // triggers Idle → _playNext
        return true;
    },

    /** @param {string} guildId */
    pause(guildId) {
        const queue = queues.get(guildId);
        if (!queue) return false;
        return queue.player.pause();
    },

    /** @param {string} guildId */
    resume(guildId) {
        const queue = queues.get(guildId);
        if (!queue) return false;
        return queue.player.unpause();
    },

    /**
     * @param {string} guildId
     * @param {number} vol  - 0.0 to 2.0
     */
    setVolume(guildId, vol) {
        const queue = queues.get(guildId);
        if (!queue) return false;
        queue.volume = vol;
        const resource = queue.player.state?.resource;
        resource?.volume?.setVolume(vol);
        return true;
    },

    /** @param {string} guildId */
    shuffle(guildId) {
        const queue = queues.get(guildId);
        if (!queue || queue.tracks.length < 2) return false;
        for (let i = queue.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j], queue.tracks[i]];
        }
        return true;
    },

    /**
     * @param {string} guildId
     * @returns {{ currentTrack: Track|null, tracks: Track[], volume: number, status: string, startedAt: number|null }}
     */
    getState(guildId) {
        const queue = queues.get(guildId);
        if (!queue) return null;
        return {
            currentTrack: queue.currentTrack,
            tracks: [...queue.tracks],
            volume: queue.volume,
            status: queue.player.state.status,
            startedAt: queue.startedAt,
        };
    },

    /** @param {string} guildId */
    isActive(guildId) {
        return queues.has(guildId);
    },
};
