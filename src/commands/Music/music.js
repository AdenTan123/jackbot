/**
 * /music — Main music command with separate join functionality
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
            .setDisabled(!hasQueue || (state && state.volume <= 0)),
        new ButtonBuilder()
            .setCustomId('music_admin_vol_up')
            .setLabel('🔊 Vol +10%')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!hasQueue || (state && state.volume >= 2)),
        new ButtonBuilder()
            .setCustomId('music_admin_refresh')
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Secondary),
    );

    return { embed, components: [row1, row2] };
}

export default {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Music player commands')
        .addSubcommand((sub) =>
            sub
                .setName('join')
                .setDescription('Make the bot join your voice channel'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('play')
                .setDescription('Search YouTube and play a song (bot must be in VC first)')
                .addStringOption((o) =>
                    o
                        .setName('query')
                        .setDescription('Song name or YouTube URL')
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('stop')
                .setDescription('Stop playback and disconnect from the voice channel'),
        )
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
            if (sub === 'join') await handleJoin(interaction);
            else if (sub === 'play') await handlePlay(interaction);
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

// ─── JOIN COMMAND ─────────────────────────────────────────────────────────

async function handleJoin(interaction) {
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
        });
    }

    const botMember = interaction.guild.members.me;
    if (!voiceChannel.permissionsFor(botMember).has('Connect')) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: '❌ Missing Permission',
                    description: `I don't have permission to join ${voiceChannel.name}!`,
                    color: 'error',
                }),
            ],
        });
    }

    try {
        await MusicService.join(voiceChannel);
        
        // Clear inactivity timeout and keep connected
        const queue = MusicService._getQueue(interaction.guildId);
        queue._clearInactivityTimeout();
        
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: '✅ Joined Voice Channel',
                    description: `Successfully joined **${voiceChannel.name}**! Use \`/music play\` to add songs.`,
                    color: 'success',
                }),
            ],
        });
    } catch (error) {
        logger.error('[music/join] Error:', error);
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: '❌ Failed to Join',
                    description: `Could not join ${voiceChannel.name}. Please try again.`,
                    color: 'error',
                }),
            ],
        });
    }
}

// ─── PLAY COMMAND ─────────────────────────────────────────────────────────

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
        });
    }

    // Check if bot is in a voice channel
    const botMember = interaction.guild.members.me;
    const botVoiceChannel = botMember.voice.channel;
    
    if (!botVoiceChannel) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: '❌ Bot Not in Voice Channel',
                    description: 'Use `/music join` first to make me join your voice channel!',
                    color: 'error',
                }),
            ],
        });
    }

    // Check if bot is in the same voice channel as user
    if (botVoiceChannel.id !== voiceChannel.id) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: '❌ Wrong Voice Channel',
                    description: `I'm already in **${botVoiceChannel.name}**. Please join that channel first!`,
                    color: 'error',
                }),
            ],
        });
    }

    const query = interaction.options.getString('query', true);

    // Send searching message
    await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            createEmbed({
                title: '🔍 Searching...',
                description: `Looking up **${query}**`,
                color: 'primary',
            }),
        ],
    });

    // Get queue and prevent timeout during search
    const queue = MusicService._getQueue(interaction.guildId);
    queue._clearInactivityTimeout();
    queue._isLoading = true;

    const track = await MusicService.search(query);
    
    queue._isLoading = false;

    if (!track) {
        queue._startInactivityTimer();
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: '❌ No Results Found',
                    description: `Couldn't find anything for **${query}**. Try a different search!`,
                    color: 'error',
                }),
            ],
        });
    }

    track.requesterId = interaction.user.id;
    track.requesterTag = interaction.user.tag;

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
    });

    // Send public announcement
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

// ─── STOP COMMAND ─────────────────────────────────────────────────────────

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
        });
    }

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('⏹ Music stopped and queue cleared.', '✅ Stopped')],
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

// ─── ADMIN COMMAND ─────────────────────────────────────────────────────────

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
        });
    }

    const { embed, components } = buildAdminPanel(interaction.guildId);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components,
    });
}

export { buildAdminPanel };