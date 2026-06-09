/**
 * /join - Joins the voice channel
 */

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { MusicService } from '../../services/musicService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Make the bot join your voice channel'),

    category: 'Music',

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

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
            
            // Clear any inactivity timeout immediately