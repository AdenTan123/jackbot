import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { EMOJI_IDS } from '../../config/emojis.js';

export default {
    data: new SlashCommandBuilder()
        .setName('delete-guilddata')
        .setDescription('Purges all stored database files/entries for this server.')
        .setDMPermission(false),

    async execute(interaction) {
        try {
            // Safe permission check using the interaction's direct helper
            if (!interaction.memberPermissions?.has('Administrator')) {
                return interaction.reply({
                    content: '❌ You do not have permission to use this command. (Requires Administrator)',
                    flags: 'Ephemeral' // Single string format is native and safe
                });
            }

            const warningEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⚠️ CRITICAL WARNING: Database Purge')
                .setDescription('Proceeding will completely wipe all server logs, configurations, and settings from our database.\n\nThis action is **completely irreversible**. Are you absolutely sure you want to proceed?')
                .setTimestamp();

            // Safety check: If the emoji path is slightly off, fall back to standard emojis instead of crashing
            const dangerEmoji = typeof EMOJI_IDS !== 'undefined' && EMOJI_IDS?.danger ? { id: EMOJI_IDS.danger } : '⚠️';
            const crossEmoji = typeof EMOJI_IDS !== 'undefined' && EMOJI_IDS?.cross ? { id: EMOJI_IDS.cross } : '❌';

            const confirmButton = new ButtonBuilder()
                .setCustomId('delete_guild_confirm')
                .setLabel('Confirm Delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(dangerEmoji);

            const cancelButton = new ButtonBuilder()
                .setCustomId('delete_guild_cancel')
                .setLabel('Cancel Process')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(crossEmoji);

            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            await interaction.reply({
                embeds: [warningEmbed],
                components: [row],
                flags: 'Ephemeral' 
            });

        } catch (error) {
            // This forces the real hidden error to print in your docker logs!
            console.error('==================================================');
            console.error('🚨 REAL HIDDEN CRASH ENCOUNTERED:');
            console.error(error);
            console.error('==================================================');
            
            // Re-throw so the framework still knows it failed
            throw error;
        }
    }
};