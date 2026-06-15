import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
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

        // Send confirmation prompt to user
        await interaction.reply({
            content: '⚠️ **CRITICAL WARNING:** Proceeding will completely wipe all server logs, configurations, and settings from our database. This action is entirely irreversible.\n\nAre you absolutely sure you want to proceed?',
            components: [row],
            ephemeral: true
        });
    }
};