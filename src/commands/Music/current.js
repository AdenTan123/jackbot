/**
 * /current — Shows the currently playing track with a live progress bar.
 */

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { MusicService } from '../../services/musicService.js';
import { AudioPlayerStatus } from '@discordjs/voice';

/** Build a text progress bar */
function progressBar(elapsedSec, totalSec, size = 16) {
    if (!totalSec || totalSec <= 0) return '`[  LIVE  ]`';
    const ratio = Math.min(elapsedSec / totalSec, 1);
    const filled = Math.round(size * ratio);
    const empty = size - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const fmt = (s) => {
        const m = Math.floor(s / 60);
        const sec = String(Math.floor(s % 60)).padStart(2, '0');
        return `${m}:${sec}`;
    };
    return `\`${bar}\`  ${fmt(elapsedSec)} / ${fmt(totalSec)}`;
}

/** Parse "mm:ss" → seconds */
function parseDuration(dur) {
    if (!dur || dur === 'Live') return 0;
    const parts = dur.split(':').map(Number);
    return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
}

export default {
    data: new SlashCommandBuilder()
        .setName('current')
        .setDescription('Shows the currently playing track'),

    category: 'Music',

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn('[current] Interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
            });
            return;
        }

        try {
            const state = MusicService.getState(interaction.guildId);

            if (!state || !state.currentTrack) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: '🎵 Nothing Playing',
                            description: 'There is nothing playing right now. Use `/music play` to start some tunes!',
                            color: 'secondary',
                        }),
                    ],
                });
            }

            const track = state.currentTrack;
            const totalSec = parseDuration(track.duration);
            const elapsedSec = state.startedAt
                ? Math.floor((Date.now() - state.startedAt) / 1000)
                : 0;

            const isPaused = state.status === AudioPlayerStatus.Paused;
            const statusIcon = isPaused ? '⏸' : '▶️';

            const embed = createEmbed({
                title: `${statusIcon} Now Playing`,
                description: `**[${track.title}](${track.url})**`,
                color: 'primary',
            })
                .addFields(
                    { name: '⏱ Duration', value: track.duration, inline: true },
                    { name: '🔊 Volume', value: `${Math.round(state.volume * 100)}%`, inline: true },
                    {
                        name: '👤 Requested by',
                        value: track.requesterId ? `<@${track.requesterId}>` : track.requesterTag ?? 'Unknown',
                        inline: true,
                    },
                    {
                        name: '📊 Progress',
                        value: progressBar(elapsedSec, totalSec),
                        inline: false,
                    },
                    {
                        name: '📋 Up Next',
                        value:
                            state.tracks.length > 0
                                ? `**[${state.tracks[0].title}](${state.tracks[0].url})**\n+${state.tracks.length - 1} more in queue`
                                : 'Nothing — add a song with `/music play`!',
                        inline: false,
                    },
                );

            if (track.thumbnail) embed.setThumbnail(track.thumbnail);

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('[current] Error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: '❌ Error',
                        description: 'Could not retrieve current track info.',
                        color: 'error',
                    }),
                ],
            });
        }
    },
};
