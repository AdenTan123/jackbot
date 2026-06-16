import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { EMOJI_IDS } from '../../config/emojis.js';

export default {
    data: new SlashCommandBuilder()
        .setName('delete-guilddata')
        .setDescription('Purges all stored database files/entries for this server.')
        .setDMPermission(false),

    async execute(interaction) {
        try {
            // Safe permission checker across all discord.js versions
            const permissions = interaction.member?.permissions || interaction.memberPermissions;
            if (!permissions || !permissions.has('Administrator')) {
                const noPermsPayload = { 
                    content: '❌ You do not have permission to use this command. (Requires Administrator)', 
                    flags: 64 
                };
                if (interaction.replied || interaction.deferred) {
                    return await interaction.editReply(noPermsPayload);
                } else {
                    return await interaction.reply(noPermsPayload);
                }
            }

            const warningEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⚠️ CRITICAL WARNING: Database Purge')
                .setDescription('Proceeding will completely wipe all server logs, configurations, and settings from our database.\n\nThis action is **completely irreversible**. Are you absolutely sure you want to proceed?')
                .setTimestamp();

            // Safe emoji mapping with hard fallbacks to prevent crashes if IDs are misconfigured
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

            const finalPayload = {
                embeds: [warningEmbed],
                components: [row]
                // REMOVED: flags: 64 - NO MORE EPHEMERAL!
            };

            // Adaptive Execution Layer: Adapts automatically to your framework's state
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(finalPayload);
            } else {
                await interaction.reply(finalPayload);
            }

        } catch (error) {
            console.error('🚨 INDESTRUCTIBLE COMMAND ERROR CRASH:');
            console.error(error);
            throw error;
        }
    }
};