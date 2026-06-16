import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('delete-guilddata')
        .setDescription('Purges all stored database files/entries for this server.')
        .setDMPermission(false),

    async execute(interaction) {
        try {
            // Safe permission check across your framework environment
            const permissions = interaction.member?.permissions || interaction.memberPermissions;
            if (!permissions || !permissions.has('Administrator')) {
                return await interaction.reply({
                    content: '❌ You do not have permission to use this command. (Requires Administrator)',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const warningEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⚠️ CRITICAL WARNING: Database Purge')
                .setDescription('Proceeding will completely wipe all server logs, configurations, and settings from our database.\n\nThis action is **completely irreversible**. Are you absolutely sure you want to proceed?')
                .setTimestamp();

            // Using standard unicode emojis here completely prevents Discord "Unknown Emoji" API rejections
            const confirmButton = new ButtonBuilder()
                .setCustomId('delete_guild_confirm')
                .setLabel('Confirm Delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⚠️');

            const cancelButton = new ButtonBuilder()
                .setCustomId('delete_guild_cancel')
                .setLabel('Cancel Process')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❌');

            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            await interaction.reply({
                embeds: [warningEmbed],
                components: [row],
                flags: [MessageFlags.Ephemeral] // Correct array format for your Discord.js version
            });

        } catch (error) {
            // This bypasses custom loggers and forces Railway to print the exact error trace to your dashboard
            console.error('=== CRITICAL SLASH COMMAND ERROR ===');
            console.error(error);
            console.error('====================================');
            
            // Last resort safety notification
            try {
                await interaction.reply({ 
                    content: '❌ An internal error occurred while executing this command.', 
                    flags: [MessageFlags.Ephemeral] 
                }).catch(() => {});
            } catch {
                await interaction.editReply({ 
                    content: '❌ An internal error occurred while executing this command.', 
                    components: [] 
                }).catch(() => {});
            }
        }
    }
};