/**
 * MusicService - Manages per-guild music queues and voice connections.
 * Uses @discordjs/voice for playback, play-dl for search, and yt-dlp for
 * YouTube audio streams.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    NoSubscriberBehavior,
    demuxProbe,
} from '@discordjs/voice';
import playdl from 'play-dl';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const downloadedYtDlpPath = path.resolve(
    __dirname,
    '../../.local/yt-dlp',
    process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
);

/** @type {Map<string, GuildQueue>} */
const queues = new Map();

// Initialize play-dl
try {
    await playdl.getFreeClientID();
} catch (error) {
    logger.warn('[MusicService] Could not initialize play-dl client ID:', error);
}

function getVideoUrl(videoInfo) {
    if (videoInfo?.url) return videoInfo.url;
    if (videoInfo?.id) return `https://www.youtube.com/watch?v=${videoInfo.id}`;
    return null;
}

function getThumbnailUrl(videoInfo) {
    return (
        videoInfo?.thumbnails?.[0]?.url ??
        videoInfo?.thumbnail?.url ??
        videoInfo?.thumbnail ??
        null
    );
}

function getYtDlpPath() {
    if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
    if (existsSync(downloadedYtDlpPath)) return downloadedYtDlpPath;
    return 'yt-dlp';
}

function createYtDlpAudioStream(url) {
    const child = spawn(getYtDlpPath(), [
        '--ignore-config',
        '--no-playlist',
        '--quiet',
        '--no-warnings',
        '--format',
        'bestaudio[acodec=opus][ext=webm]/bestaudio[ext=webm]/bestaudio[acodec=opus]/bestaudio/best',
        '--output',
        '-',
        url,
    ], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let closed = false;

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
        stderr += chunk;
        if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    child.on('error', (error) => {
        child.stdout.destroy(
            new Error(`Could not start yt-dlp. Run npm install or set YTDLP_PATH. ${error.message}`),
        );
    });

    child.on('close', (code) => {
        closed = true;
        if (code !== 0 && !child.stdout.destroyed) {
            const details = stderr.trim() || `yt-dlp exited with code ${code}`;
            child.stdout.destroy(new Error(details));
        }
    });

    child.stdout.on('close', () => {
        if (!closed && !child.killed) child.kill('SIGTERM');
    });

    return child.stdout;
}

async function createTrackResource(url, volume) {
    const audioStream = createYtDlpAudioStream(url);
    const { stream, type } = await demuxProbe(audioStream);
    const resource = createAudioResource(stream, {
        inputType: type,
        inlineVolume: true,
    });
    resource.volume?.setVolume(volume);
    return resource;
}

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
        this.startedAt = null;
        this._inactivityTimeout = null;
        this._isDestroying = false;
        this._isLoading = false; // CRITICAL: Prevents timeout during loading
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

    _clearInactivityTimeout() {
        if (this._inactivityTimeout) {
            clearTimeout(this._inactivityTimeout);
            this._inactivityTimeout = null;
        }
    }

    _startInactivityTimer() {
        this._clearInactivityTimeout();
        this._inactivityTimeout = setTimeout(() => {
            // Don't destroy if we're loading a track
            if (!this._isLoading && 
                this.player?.state.status === AudioPlayerStatus.Idle && 
                this.tracks.length === 0 &&
                !this.currentTrack) {
                logger.info(`[MusicService] Inactivity timeout for guild ${this.guildId}, disconnecting...`);
                this.destroy();
            }
        }, 60_000); // Increased to 60 seconds
    }

    async _playNext() {
        this._clearInactivityTimeout();

        if (this.tracks.length === 0) {
            this.currentTrack = null;
            this.startedAt = null;
            this._startInactivityTimer();
            return;
        }

        const track = this.tracks.shift();
        this.currentTrack = track;
        this.startedAt = Date.now();
        this._isLoading = true; // Set loading flag

        try {
            logger.info(`[MusicService] Loading track: "${track.title}" for guild ${this.guildId}`);
            const resource = await createTrackResource(track.url, this.volume);
            
            if (!resource || !resource.playable) {
                throw new Error('Invalid audio resource created');
            }
            
            this._isLoading = false; // Clear loading flag
            logger.info(`[MusicService] Playing track: "${track.title}" for guild ${this.guildId}`);
            this.player.play(resource);
        } catch (error) {
            this._isLoading = false; // Clear loading flag on error
            logger.error(`[MusicService] Failed to stream track "${track.title}":`, error);
            // Skip broken track and continue
            this._playNext();
        }
    }

    destroy() {
        if (this._isDestroying) return;
        this._isDestroying = true;
        
        this._clearInactivityTimeout();
        
        try {
            this.player?.stop(true);
            this.connection?.destroy();
        } catch (error) {
            logger.error(`[MusicService] Error destroying queue for guild ${this.guildId}:`, error);
        }
        
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
            
            if (/^https?:\/\//i.test(query)) {
                const info = await playdl.video_info(query);
                if (!info || !info.video_details) {
                    logger.warn('[MusicService] No video details found for URL:', query);
                    return null;
                }
                videoInfo = info.video_details;
            } else {
                const results = await playdl.search(query, {
                    source: { youtube: 'video' },
                    limit: 1,
                });
                if (!results || results.length === 0) return null;
                videoInfo = results[0];
            }

            const url = getVideoUrl(videoInfo);
            if (!url) return null;

            const durationSecs = videoInfo.durationInSec ?? 0;
            
            let duration;
            if (durationSecs === 0) {
                duration = 'Live';
            } else if (durationSecs < 60) {
                duration = `0:${String(durationSecs).padStart(2, '0')}`;
            } else {
                const mins = Math.floor(durationSecs / 60);
                const secs = String(durationSecs % 60).padStart(2, '0');
                duration = `${mins}:${secs}`;
            }

            return {
                title: videoInfo.title ?? 'Unknown Title',
                url,
                duration,
                thumbnail: getThumbnailUrl(videoInfo),
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
     * @returns {Promise<GuildQueue>}
     */
    async join(channel) {
        if (!channel.joinable) {
            throw new Error('Cannot join voice channel - missing permissions');
        }
        
        if (!channel.speakable) {
            throw new Error('Cannot speak in voice channel - missing permissions');
        }

        const queue = this._getQueue(channel.guild.id);

        if (queue.connection && queue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            return queue;
        }

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: true, // Helps with connection stability
            selfMute: false,
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        } catch (error) {
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
        
        // Clear inactivity timeout since we have tracks now
        queue._clearInactivityTimeout();

        // Only play if idle AND not loading
        if (queue.player.state.status === AudioPlayerStatus.Idle && 
            !queue.currentTrack && 
            !queue._isLoading) {
            await queue._playNext();
        }
    },

    /** @param {string} guildId */
    stop(guildId) {
        const queue = queues.get(guildId);
        if (!queue) return false;
        queue.tracks = [];
        queue._clearInactivityTimeout();
        queue.destroy();
        return true;
    },

    /** @param {string} guildId */
    skip(guildId) {
        const queue = queues.get(guildId);
        if (!queue || !queue.currentTrack) return false;
        
        queue.startedAt = null;
        queue.player.stop();
        return true;
    },

    /** @param {string} guildId */
    pause(guildId) {
        const queue = queues.get(guildId);
        if (!queue) return false;
        
        try {
            queue.player.pause();
            return true;
        } catch (error) {
            logger.error(`[MusicService] Error pausing in guild ${guildId}:`, error);
            return false;
        }
    },

    /** @param {string} guildId */
    resume(guildId) {
        const queue = queues.get(guildId);
        if (!queue) return false;
        
        try {
            queue.player.unpause();
            return true;
        } catch (error) {
            logger.error(`[MusicService] Error resuming in guild ${guildId}:`, error);
            return false;
        }
    },

    /**
     * @param {string} guildId
     * @param {number} vol  - 0.0 to 2.0
     */
    setVolume(guildId, vol) {
        const clampedVol = Math.max(0, Math.min(2.0, vol));
        
        const queue = queues.get(guildId);
        if (!queue) return false;
        
        queue.volume = clampedVol;
        
        const resource = queue.player?.state?.resource;
        if (resource?.volume) {
            resource.volume.setVolume(clampedVol);
        }
        
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
     * Remove a track from the queue by index
     * @param {string} guildId
     * @param {number} index
     * @returns {boolean}
     */
    removeTrack(guildId, index) {
        const queue = queues.get(guildId);
        if (!queue || index < 0 || index >= queue.tracks.length) return false;
        
        queue.tracks.splice(index, 1);
        return true;
    },

    /**
     * Get current queue position for a track
     * @param {string} guildId
     * @param {string} trackUrl
     * @returns {number}
     */
    getTrackPosition(guildId, trackUrl) {
        const queue = queues.get(guildId);
        if (!queue) return -1;
        
        return queue.tracks.findIndex(track => track.url === trackUrl);
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
            status: queue.player?.state?.status ?? AudioPlayerStatus.Idle,
            startedAt: queue.startedAt,
        };
    },

    /** @param {string} guildId */
    isActive(guildId) {
        return queues.has(guildId);
    },
    
    /**
     * Get queue length
     * @param {string} guildId
     * @returns {number}
     */
    getQueueLength(guildId) {
        const queue = queues.get(guildId);
        return queue ? queue.tracks.length : 0;
    },
    
    /**
     * Clear all queues (useful for shutdown)
     */
    clearAllQueues() {
        for (const [guildId, queue] of queues) {
            queue.destroy();
        }
        queues.clear();
    }
};