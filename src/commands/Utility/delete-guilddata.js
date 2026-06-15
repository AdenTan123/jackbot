import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { EMOJI_IDS } from '../../config/emojis.js';

export default {
    data: new SlashCommandBuilder()
        .setName('delete-guilddata')
        .setDescription('Purges all stored database files/entries for this server.')
        .setDMPermission(false),

    async execute(interaction) {
        // Administrative safeguard check
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command. (Requires Administrator)',
                ephemeral: true
            });
        }

        // Create a clean warning embed
        const warningEmbed = new EmbedBuilder()
            .setColor('#FF0000') // Red danger theme
            .setTitle('⚠️ CRITICAL WARNING: Database Purge')
            .setDescription('Proceeding will completely wipe all server logs, configurations, and settings from our database.\n\nThis action is **completely irreversible**. Are you absolutely sure you want to proceed?')
            .setTimestamp();

        // Build Confirmation Button
        const confirmButton = new ButtonBuilder()
            .setCustomId('delete_guild_confirm')
            .setLabel('Confirm Delete')
            .setStyle(ButtonStyle.Danger)
            .setEmoji({ id: EMOJI_IDS.danger });

        // Build Cancel Button
        const cancelButton = new ButtonBuilder()
            .setCustomId('delete_guild_cancel')
            .setLabel('Cancel Process')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji({ id: EMOJI_IDS.cross });

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        // CHANGED: Swapped editReply out for a standard initial reply
        await interaction.reply({
            embeds: [warningEmbed],
            components: [row],
            ephemeral: true // Keeps the interaction private and secure
        });
    }
};