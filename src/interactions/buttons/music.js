/**
 * Button handlers for the /music admin control panel.
 * Each entry is registered in client.buttons under its name.
 */

import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { MusicService } from '../../services/musicService.js';
import { buildAdminPanel } from '../../commands/Music/music.js';

// ─── Shared helpers ──────────────────────────────────────────────────────────

async function requireManageGuild(interaction) {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
            embeds: [
                createEmbed({
                    title: '🚫 Permission Denied',
                    description: 'You need the **Manage Guild** permission to use these controls.',
                    color: 'error',
                }),
            ],
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }
    return true;
}

async function refreshPanel(interaction, footerMessage) {
    const { embed, components } = buildAdminPanel(interaction.guildId);
    if (footerMessage) embed.setFooter({ text: footerMessage });
    await interaction.update({ embeds: [embed], components });
}

// ─── Individual button handlers ──────────────────────────────────────────────

const pauseResume = {
    name: 'music_admin_pause_resume',
    async execute(interaction) {
        if (!(await requireManageGuild(interaction))) return;
        try {
            const state = MusicService.getState(interaction.guildId);
            let msg;
            if (state?.status === 'paused') {
                MusicService.resume(interaction.guildId);
                msg = '▶️ Resumed playback.';
            } else {
                MusicService.pause(interaction.guildId);
                msg = '⏸ Paused playback.';
            }
            await refreshPanel(interaction, msg);
        } catch (error) {
            logger.error('[music button] pause_resume error:', error);
        }
    },
};

const skip = {
    name: 'music_admin_skip',
    async execute(interaction) {
        if (!(await requireManageGuild(interaction))) return;
        try {
            const skipped = MusicService.skip(interaction.guildId);
            await refreshPanel(interaction, skipped ? '⏭ Skipped to next track.' : '⚠️ Nothing to skip.');
        } catch (error) {
            logger.error('[music button] skip error:', error);
        }
    },
};

const shuffle = {
    name: 'music_admin_shuffle',
    async execute(interaction) {
        if (!(await requireManageGuild(interaction))) return;
        try {
            const shuffled = MusicService.shuffle(interaction.guildId);
            await refreshPanel(interaction, shuffled ? '🔀 Queue shuffled!' : '⚠️ Not enough tracks to shuffle.');
        } catch (error) {
            logger.error('[music button] shuffle error:', error);
        }
    },
};

const stop = {
    name: 'music_admin_stop',
    async execute(interaction) {
        if (!(await requireManageGuild(interaction))) return;
        try {
            MusicService.stop(interaction.guildId);
            await refreshPanel(interaction, '⏹ Music stopped and queue cleared.');
        } catch (error) {
            logger.error('[music button] stop error:', error);
        }
    },
};

const volDown = {
    name: 'music_admin_vol_down',
    async execute(interaction) {
        if (!(await requireManageGuild(interaction))) return;
        try {
            const state = MusicService.getState(interaction.guildId);
            if (state) {
                const newVol = Math.max(0, parseFloat((state.volume - 0.1).toFixed(2)));
                MusicService.setVolume(interaction.guildId, newVol);
                await refreshPanel(interaction, `🔉 Volume set to ${Math.round(newVol * 100)}%.`);
            } else {
                await refreshPanel(interaction, '⚠️ Nothing is playing.');
            }
        } catch (error) {
            logger.error('[music button] vol_down error:', error);
        }
    },
};

const volUp = {
    name: 'music_admin_vol_up',
    async execute(interaction) {
        if (!(await requireManageGuild(interaction))) return;
        try {
            const state = MusicService.getState(interaction.guildId);
            if (state) {
                const newVol = Math.min(2.0, parseFloat((state.volume + 0.1).toFixed(2)));
                MusicService.setVolume(interaction.guildId, newVol);
                await refreshPanel(interaction, `🔊 Volume set to ${Math.round(newVol * 100)}%.`);
            } else {
                await refreshPanel(interaction, '⚠️ Nothing is playing.');
            }
        } catch (error) {
            logger.error('[music button] vol_up error:', error);
        }
    },
};

const refresh = {
    name: 'music_admin_refresh',
    async execute(interaction) {
        if (!(await requireManageGuild(interaction))) return;
        try {
            await refreshPanel(interaction, '🔄 Panel refreshed.');
        } catch (error) {
            logger.error('[music button] refresh error:', error);
        }
    },
};

// ─── Export all as array ─────────────────────────────────────────────────────
export default [pauseResume, skip, shuffle, stop, volDown, volUp, refresh];
