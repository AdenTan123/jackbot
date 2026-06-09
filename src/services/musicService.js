/**
 * MusicService - Manages per-guild music queues and voice connections.
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
    logger.info('[MusicService] play-dl initialized successfully');
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
    const startTime = Date.now();
    logger.info(`[MusicService] Starting yt-dlp process for: ${url}`);
    
    const child = spawn(getYtDlpPath(), [
        '--ignore-config',
        '--no-playlist',
        '--quiet',
        '--no-warnings',
        '--format',
        'bestaudio',
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
        logger.error(`[MusicService] yt-dlp error:`, error);
        child.stdout.destroy(
            new Error(`Could not start yt-dlp. ${error.message}`),
        );
    });

    child.on('close', (code) => {
        closed = true;
        const duration = Date.now() - startTime;
        logger.info(`[MusicService] yt-dlp process finished in ${duration}ms with code ${code}`);
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
    logger.info(`[MusicService] Creating track resource for: ${url}`);
    try {
        const audioStream = createYtDlpAudioStream(url);
        const { stream, type } = await demuxProbe(audioStream);
        logger.info(`[MusicService] Demux probe successful, stream type: ${type}`);
        const resource = createAudioResource(stream, {
            inputType: type,
            inlineVolume: true,
        });
        resource.volume?.setVolume(volume);
        logger.info(`[MusicService] Audio resource created successfully`);
        return resource;
    } catch (error) {
        logger.error(`[MusicService] Failed to create track resource:`, error);
        throw error;
    }
}

/**
 * @typedef {Object} Track
 * @property {string} title
 * @property {string} url
 * @property {string} duration
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
        this._isLoading = false;
        this._keepAliveInterval = null;
        this._setupPlayer();
    }

    _setupPlayer() {
        this.player = createAudioPlayer({
            behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
        });

        this.player.on(AudioPlayerStatus.Idle, () => {
            logger.info(`[MusicService] Player idle in guild ${this.guildId}`);
            this._playNext();
        });

        this.player.on(AudioPlayerStatus.Playing, () => {
            logger.info(`[MusicService] Player playing in guild ${this.guildId}`);
        });

        this.player.on(AudioPlayerStatus.Paused, () => {
            logger.info(`[MusicService] Player paused in guild ${this.guildId}`);
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
            if (!this._isLoading && 
                this.player?.state.status === AudioPlayerStatus.Idle && 
                this.tracks.length === 0 &&
                !this.currentTrack) {
                logger.info(`[MusicService] Inactivity timeout for guild ${this.guildId}, disconnecting...`);
                this.destroy();
            }
        }, 180000);
    }

    async _playNext() {
        this._clearInactivityTimeout();
        logger.info(`[MusicService] _playNext called, tracks left: ${this.tracks.length}`);

        if (this.tracks.length === 0) {
            this.currentTrack = null;
            this.startedAt = null;
            this._startInactivityTimer();
            logger.info(`[MusicService] No more tracks in queue for guild ${this.guildId}`);
            return;
        }

        const track = this.tracks.shift();
        this.currentTrack = track;
        this.startedAt = Date.now();
        this._isLoading = true;

        logger.info(`[MusicService] Playing next track: "${track.title}" for guild ${this.guildId}`);

        this._keepAliveInterval = setInterval(() => {
            if (this._isLoading) {
                this._clearInactivityTimeout();
                logger.debug(`[MusicService] Still loading "${track.title}", keeping connection alive...`);
            }
        }, 10000);

        try {
            const resource = await createTrackResource(track.url, this.volume);
            
            if (!resource) {
                throw new Error('Resource is null');
            }
            
            this._isLoading = false;
            if (this._keepAliveInterval) {
                clearInterval(this._keepAliveInterval);
                this._keepAliveInterval = null;
            }
            
            logger.info(`[MusicService] Playing track: "${track.title}"`);
            this.player.play(resource);
            
            // Verify it's actually playing
            setTimeout(() => {
                if (this.player.state.status !== AudioPlayerStatus.Playing) {
                    logger.warn(`[MusicService] Track "${track.title}" is not playing! Status: ${this.player.state.status}`);
                }
            }, 2000);
            
        } catch (error) {
            this._isLoading = false;
            if (this._keepAliveInterval) {
                clearInterval(this._keepAliveInterval);
                this._keepAliveInterval = null;
            }
            
            logger.error(`[MusicService] Failed to stream track "${track.title}":`, error);
            this._playNext();
        }
    }

    destroy() {
        if (this._isDestroying) return;
        this._isDestroying = true;
        
        if (this._keepAliveInterval) {
            clearInterval(this._keepAliveInterval);
            this._keepAliveInterval = null;
        }
        
        this._clearInactivityTimeout();
        
        try {
            this.player?.stop(true);
            this.connection?.destroy();
            logger.info(`[MusicService] Destroyed queue for guild ${this.guildId}`);
        } catch (error) {
            logger.error(`[MusicService] Error destroying queue for guild ${this.guildId}:`, error);
        }
        
        queues.delete(this.guildId);
    }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const MusicService = {
    _getQueue(guildId) {
        if (!queues.has(guildId)) {
            logger.info(`[MusicService] Creating new queue for guild ${guildId}`);
            queues.set(guildId, new GuildQueue(guildId));
        }
        return queues.get(guildId);
    },

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

    async join(channel) {
        if (!channel.joinable) {
            throw new Error('Cannot join voice channel - missing permissions');
        }
        
        if (!channel.speakable) {
            throw new Error('Cannot speak in voice channel - missing permissions');
        }

        const queue = this._getQueue(channel.guild.id);

        if (queue.connection && queue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            logger.info(`[MusicService] Already connected to voice channel in guild ${channel.guild.id}`);
            return queue;
        }

        logger.info(`[MusicService] Joining voice channel ${channel.name} in guild ${channel.guild.id}`);
        
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false,
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 30000);
            logger.info(`[MusicService] Successfully joined voice channel ${channel.name}`);
        } catch (error) {
            connection.destroy();
            logger.error(`[MusicService] Failed to join voice channel:`, error);
            throw new Error('Could not connect to the voice channel in time.');
        }

        queue.connection = connection;
        connection.subscribe(queue.player);

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            logger.warn(`[MusicService] Disconnected from voice channel in guild ${channel.guild.id}`);
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                ]);
            } catch {
                logger.warn(`[MusicService] Failed to reconnect, destroying queue`);
                queue.destroy();
            }
        });

        return queue;
    },

    async addTrack(guildId, track) {
        const queue = this._getQueue(guildId);
        queue.tracks.push(track);
        logger.info(`[MusicService] Added track "${track.title}" to queue. Queue length: ${queue.tracks.length}`);
        
        queue._clearInactivityTimeout();

        const isIdle = queue.player.state.status === AudioPlayerStatus.Idle;
        const hasNoCurrentTrack = !queue.currentTrack;
        const notLoading = !queue._isLoading;
        
        logger.info(`[MusicService] Player status: ${queue.player.state.status}, hasCurrentTrack: ${!!queue.currentTrack}, isLoading: ${queue._isLoading}`);
        
        if (isIdle && hasNoCurrentTrack && notLoading) {
            logger.info(`[MusicService] Starting playback immediately`);
            await queue._playNext();
        } else {
            logger.info(`[MusicService] Track queued, will play later`);
        }
    },

    stop(guildId) {
        const queue = queues.get(guildId);
        if (!queue) return false;
        queue.tracks = [];
        queue._clearInactivityTimeout();
        queue.destroy();
        return true;
    },

    skip(guildId) {
        const queue = queues.get(guildId);
        if (!queue || !queue.currentTrack) return false;
        
        queue.startedAt = null;
        queue.player.stop();
        return true;
    },

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

    shuffle(guildId) {
        const queue = queues.get(guildId);
        if (!queue || queue.tracks.length < 2) return false;
        
        for (let i = queue.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j], queue.tracks[i]];
        }
        return true;
    },

    removeTrack(guildId, index) {
        const queue = queues.get(guildId);
        if (!queue || index < 0 || index >= queue.tracks.length) return false;
        
        queue.tracks.splice(index, 1);
        return true;
    },

    getTrackPosition(guildId, trackUrl) {
        const queue = queues.get(guildId);
        if (!queue) return -1;
        
        return queue.tracks.findIndex(track => track.url === trackUrl);
    },

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

    isActive(guildId) {
        return queues.has(guildId);
    },
    
    getQueueLength(guildId) {
        const queue = queues.get(guildId);
        return queue ? queue.tracks.length : 0;
    },
    
    clearAllQueues() {
        for (const [guildId, queue] of queues) {
            queue.destroy();
        }
        queues.clear();
    }
};