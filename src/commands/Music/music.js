/**
 * /music — Main music command.
 *
 * Subcommands:
 *   play  <query>  – Search YouTube and add a track to the queue.
 *   stop           – Stop playback and disconnect (admin only).
 *   admin          – Admin control panel with interactive buttons.
 */

import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { MusicService } from '../../services/musicService.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildAdminPanel(guildId) {
    const state = MusicService.getState(guildId);
    const isPaused = state?.status === 'paused';
    const hasQueue = state && (state.currentTrack || state.tracks.length > 0);

    const volPct = state ? Math.round(state.volume * 100) : 50;

    const embed = createEmbed({
        title: '🎛️ Music Admin Panel',
        description: state?.currentTrack
            ? `**Now playing:** [${state.currentTrack.title}](${state.currentTrack.url})`
            : '⏸️ Nothing is currently playing.',
        color: 'primary',
    }).addFields(
        { name: '🔊 Volume', value: `${volPct}%`, inline: true },
        { name: '📋 Queue', value: `${state?.tracks.length ?? 0} track(s) remaining`, inline: true },
        { name: '⚙️ Status', value: isPaused ? '⏸ Paused' : '▶️ Playing', inline: true },
    );

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_admin_pause_resume')
            .setLabel(isPaused ? '▶️ Resume' : '⏸ Pause')
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!hasQueue),
        new ButtonBuilder()
            .setCustomId('music_admin_skip')
            .setLabel('⏭ Skip')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!hasQueue),
        new ButtonBuilder()
            .setCustomId('music_admin_shuffle')
            .setLabel('🔀 Shuffle')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!state || state.tracks.length < 2),
        new ButtonBuilder()
            .setCustomId('music_admin_stop')
            .setLabel('⏹ Stop')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!hasQueue),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_admin_vol_down')
            .setLabel('🔉 Vol -10%')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!hasQueue || state.volume <= 0),
        new ButtonBuilder()
            .setCustomId('music_admin_vol_up')
            .setLabel('🔊 Vol +10%')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!hasQueue || state.volume >= 2),
        new ButtonBuilder()
            .setCustomId('music_admin_refresh')
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Secondary),
    );

    return { embed, components: [row1, row2] };
}

// ─── Command ────────────────────────────────────────────────────────────────

export default {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Music player commands')
        // /music play
        .addSubcommand((sub) =>
            sub
                .setName('play')
                .setDescription('Search YouTube and play a song (or add to queue)')
                .addStringOption((o) =>
                    o
                        .setName('query')
                        .setDescription('Song name or YouTube URL')
                        .setRequired(true),
                ),
        )
        // /music stop
        .addSubcommand((sub) =>
            sub
                .setName('stop')
                .setDescription('Stop playback and disconnect from the voice channel'),
        )
        // /music admin
        .addSubcommand((sub) =>
            sub
                .setName('admin')
                .setDescription('Open the admin music control panel (requires Manage Guild)'),
        ),

    category: 'Music',

    async execute(interaction, _config, _client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferSuccess) {
            logger.warn('[music] Interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
            });
            return;
        }

        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'play') await handlePlay(interaction);
            else if (sub === 'stop') await handleStop(interaction);
            else if (sub === 'admin') await handleAdmin(interaction);
        } catch (error) {
            logger.error(`[music/${sub}] Error:`, error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(error.message || 'An unexpected error occurred.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

// ─── Subcommand Handlers ─────────────────────────────────────────────────────

async function handlePlay(interaction) {
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: '❌ Not in a Voice Channel',
                    description: 'You need to join a voice channel first!',
                    color: 'error',
                }),
            ],
            flags: MessageFlags.Ephemeral,
        });
    }

    const query = interaction.options.getString('query', true);

    // Search
    await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            createEmbed({
                title: '🔍 Searching...',
                description: `Looking up **${query}**`,
                color: 'primary',
            }),
        ],
        flags: MessageFlags.Ephemeral,
    });

    const track = await MusicService.search(query);

    if (!track) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: '❌ No Results Found',
                    description: `Couldn't find anything for **${query}**. Try a different search!`,
                    color: 'error',
                }),
            ],
            flags: MessageFlags.Ephemeral,
        });
    }

    track.requesterId = interaction.user.id;
    track.requesterTag = interaction.user.tag;

    // Join if not already connected
    if (!MusicService.isActive(interaction.guildId)) {
        await MusicService.join(voiceChannel);
    }

    const stateBefore = MusicService.getState(interaction.guildId);
    const isFirstTrack = !stateBefore?.currentTrack && stateBefore?.tracks.length === 0;

    await MusicService.addTrack(interaction.guildId, track);

    const embed = createEmbed({
        title: isFirstTrack ? '🎵 Now Playing' : '✅ Added to Queue',
        description: `**[${track.title}](${track.url})**`,
        color: 'success',
    })
        .addFields(
            { name: '⏱ Duration', value: track.duration, inline: true },
            { name: '🎤 Requested by', value: `<@${interaction.user.id}>`, inline: true },
        );

    if (track.thumbnail) embed.setThumbnail(track.thumbnail);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
    });

    // Also send a non-ephemeral notice to the channel
    await interaction.followUp({
        embeds: [
            createEmbed({
                title: isFirstTrack ? '🎵 Now Playing' : '📋 Added to Queue',
                description: `**[${track.title}](${track.url})**\nRequested by <@${interaction.user.id}> · ${track.duration}`,
                color: 'primary',
            }).setThumbnail(track.thumbnail ?? null),
        ],
    });
}

async function handleStop(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: '🚫 Permission Denied',
                    description: 'You need the **Manage Guild** permission to stop the music.',
                    color: 'error',
                }),
            ],
            flags: MessageFlags.Ephemeral,
        });
    }

    const stopped = MusicService.stop(interaction.guildId);

    if (!stopped) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: '⚠️ Nothing Playing',
                    description: "I'm not playing anything right now.",
                    color: 'warning',
                }),
            ],
            flags: MessageFlags.Ephemeral,
        });
    }

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('⏹ Music stopped and queue cleared.', '✅ Stopped')],
        flags: MessageFlags.Ephemeral,
    });

    await interaction.followUp({
        embeds: [
            createEmbed({
                title: '⏹ Music Stopped',
                description: `Playback stopped by <@${interaction.user.id}>.`,
                color: 'secondary',
            }),
        ],
    });
}

async function handleAdmin(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: '🚫 Permission Denied',
                    description: 'You need the **Manage Guild** permission to use the admin panel.',
                    color: 'error',
                }),
            ],
            flags: MessageFlags.Ephemeral,
        });
    }

    const { embed, components } = buildAdminPanel(interaction.guildId);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components,
        flags: MessageFlags.Ephemeral,
    });
}

// ─── Export helpers for button handler ──────────────────────────────────────
export { buildAdminPanel };
