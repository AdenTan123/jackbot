/**
 * /playlist — Shows the current music queue with pagination.
 */

import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { MusicService } from '../../services/musicService.js';

const TRACKS_PER_PAGE = 10;
const PANEL_TIMEOUT_MS = 5 * 60 * 1000;

function buildPlaylistEmbed(guildId, page) {
    const state = MusicService.getState(guildId);

    if (!state || (!state.currentTrack && state.tracks.length === 0)) {
        return {
            embed: createEmbed({
                title: '📋 Queue is Empty',
                description: 'Nothing in the queue. Use `/music play` to add some tracks!',
                color: 'secondary',
            }),
            components: [],
            totalPages: 1,
        };
    }

    const allTracks = state.tracks;
    const totalPages = Math.max(1, Math.ceil(allTracks.length / TRACKS_PER_PAGE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const start = safePage * TRACKS_PER_PAGE;
    const pageSlice = allTracks.slice(start, start + TRACKS_PER_PAGE);

    let description = '';
    if (state.currentTrack) {
        description += `**▶️ Now Playing:**\n[${state.currentTrack.title}](${state.currentTrack.url})\n⏱ ${state.currentTrack.duration}`;
        if (state.currentTrack.requesterId) {
            description += ` · Req by <@${state.currentTrack.requesterId}>`;
        }
        description += '\n\n';
    }

    if (allTracks.length === 0) {
        description += '_Queue is empty._';
    } else {
        description += '**📋 Up Next:**\n';
        description += pageSlice
            .map((t, i) => {
                const pos = start + i + 1;
                const req = t.requesterId ? ` · <@${t.requesterId}>` : '';
                return `\`${String(pos).padStart(2, ' ')}.\` [${t.title}](${t.url}) · ${t.duration}${req}`;
            })
            .join('\n');
    }

    const embed = createEmbed({
        title: '📋 Music Queue',
        description,
        color: 'primary',
        footer: `Page ${safePage + 1}/${totalPages} · ${allTracks.length} track(s) in queue · Vol ${Math.round(state.volume * 100)}%`,
    });

    const prev = new ButtonBuilder()
        .setCustomId(`playlist_prev_${safePage}`)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0);

    const next = new ButtonBuilder()
        .setCustomId(`playlist_next_${safePage}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1);

    const refresh = new ButtonBuilder()
        .setCustomId(`playlist_refresh_${safePage}`)
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Primary);

    const components = totalPages > 0
        ? [new ActionRowBuilder().addComponents(prev, refresh, next)]
        : [];

    return { embed, components, totalPages, safePage };
}

export default {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('View the current music queue'),

    category: 'Music',

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn('[playlist] Interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
            });
            return;
        }

        try {
            let currentPage = 0;
            const { embed, components } = buildPlaylistEmbed(interaction.guildId, currentPage);

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });

            if (!components.length) return;

            const collector = interaction.channel?.createMessageComponentCollector({
                filter: (i) =>
                    i.user.id === interaction.user.id &&
                    (i.customId.startsWith('playlist_prev_') ||
                        i.customId.startsWith('playlist_next_') ||
                        i.customId.startsWith('playlist_refresh_')),
                time: PANEL_TIMEOUT_MS,
            });

            collector?.on('collect', async (btnInteraction) => {
                await btnInteraction.deferUpdate();

                if (btnInteraction.customId.startsWith('playlist_prev_')) {
                    currentPage = Math.max(0, currentPage - 1);
                } else if (btnInteraction.customId.startsWith('playlist_next_')) {
                    currentPage++;
                }

                const { embed: newEmbed, components: newComponents } = buildPlaylistEmbed(
                    interaction.guildId,
                    currentPage,
                );
                await interaction.editReply({ embeds: [newEmbed], components: newComponents });
            });

            collector?.on('end', async () => {
                try {
                    await interaction.editReply({ components: [] });
                } catch (_) {}
            });
        } catch (error) {
            logger.error('[playlist] Error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: '❌ Error',
                        description: 'Could not retrieve the playlist.',
                        color: 'error',
                    }),
                ],
            });
        }
    },
};