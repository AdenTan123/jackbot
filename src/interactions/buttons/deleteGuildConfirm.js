import { EMOJIS } from '../../config/emojis.js';

export default {
    name: 'delete_guild_confirm',

    async execute(interaction) {
        try {
            // Check if interaction is already handled
            if (interaction.replied || interaction.deferred) {
                return;
            }

            const permissions = interaction.member?.permissions || interaction.memberPermissions;
            if (!permissions || !permissions.has('Administrator')) {
                return interaction.reply({
                    content: '❌ Only administrators can confirm database purges.',
                    flags: 64
                });
            }

            // IMPORTANT: Use deferUpdate() to acknowledge the button interaction
            // This updates the original message and shows "thinking" state
            await interaction.deferUpdate();

            // 📝 PLACE YOUR DATABASE DELETION QUERIES HERE
            // Example: await db.query('DELETE FROM guilds WHERE id = $1', [interaction.guildId]);
            
            // Simulate async operation
            await new Promise(resolve => setTimeout(resolve, 500));

            // IMPORTANT: Use update() instead of editReply()
            // Since we used deferUpdate(), we need to use update() to modify the original message
            await interaction.update({
                content: `${EMOJIS?.check || '✅'} **Success:** All database structures associated with this guild have been permanently purged.`,
                embeds: [],
                components: [] // This removes the buttons
            });

        } catch (error) {
            console.error('🚨 CONFIRM BUTTON ERROR CRASH:', error);
            
            try {
                // Try to update the original message with error
                await interaction.update({
                    content: `${EMOJIS?.cross || '❌'} **System Error:** An internal error blocked full execution of your database purge.`,
                    embeds: [],
                    components: []
                });
            } catch (updateError) {
                // If update fails, try to reply with ephemeral error
                try {
                    await interaction.reply({
                        content: `${EMOJIS?.cross || '❌'} **System Error:** An internal error occurred.`,
                        flags: 64
                    });
                } catch (replyError) {
                    console.error('🚨 Failed to send error response:', replyError);
                }
            }
        }
    }
};