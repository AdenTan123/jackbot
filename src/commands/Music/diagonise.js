import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { MusicService } from '../../services/musicService.js';
import { VoiceConnectionStatus } from '@discordjs/voice';

export default {
    data: new SlashCommandBuilder()
        .setName('diagnosemusicerrs')
        .setDescription('Diagnose voice connection issues'),

    category: 'Music',

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        const botMember = guild.members.me;
        const voiceState = guild.voiceStates.cache.get(botMember.id);
        
        const diagnostics = {
            'Bot Voice Channel': voiceState?.channel?.name || 'Not connected',
            'Bot Deafened': voiceState?.serverDeaf || false,
            'Bot Muted': voiceState?.serverMute || false,
            'Music Service Active': MusicService.isActive(guild.id),
            'Queue State': MusicService.getState(guild.id) ? 'Has queue' : 'No queue',
            'Bot Permissions': {
                Connect: voiceState?.channel?.permissionsFor(botMember)?.has('Connect') || false,
                Speak: voiceState?.channel?.permissionsFor(botMember)?.has('Speak') || false,
            }
        };

        const embed = createEmbed({
            title: '🔧 Voice Connection Diagnostics',
            description: '```json\n' + JSON.stringify(diagnostics, null, 2) + '\n```',
            color: 'primary',
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};