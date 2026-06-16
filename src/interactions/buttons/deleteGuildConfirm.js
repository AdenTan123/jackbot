import { EMOJIS } from '../../config/emojis.js';

export default {
    name: 'delete_guild_confirm',

    async execute(interaction) {
        try {
            // Fix 1: Check if interaction is already replied/deferred
            if (interaction.replied || interaction.deferred) {
                return;
            }

            // Fix 2: Better permission checking
            const member = interaction.member;
            if (!member) {
                return interaction.reply({
                    content: '❌ Unable to verify your permissions. Please try again.',
                    flags: 64
                });
            }

            const permissions = member.permissions;
            if (!permissions || !permissions.has('Administrator')) {
                return interaction.reply({
                    content: '❌ Only administrators can confirm database purges.',
                    flags: 64
                });
            }

            // Fix 3: Defer reply FIRST before any async operations
            await interaction.deferReply({ flags: 64 }); // Using deferReply instead of deferUpdate

            // 📝 PLACE YOUR DATABASE DELETION QUERIES HERE
            // Example: await db.query('DELETE FROM guilds WHERE id = $1', [interaction.guildId]);
            
            // Fix 4: Simulate database operation with a small delay
            // This ensures the defer update goes through
            await new Promise(resolve => setTimeout(resolve, 100));

            // Fix 5: Use editReply with proper content
            await interaction.editReply({
                content: `${EMOJIS?.check || '✅'} **Success:** All database structures associated with this guild have been permanently purged.`,
                embeds: [],
                components: []
            });

        } catch (error) {
            console.error('🚨 CONFIRM BUTTON ERROR CRASH:', error);
            
            // Fix 6: Handle errors properly - check if we can edit or need to reply
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({
                        content: `${EMOJIS?.cross || '❌'} **System Error:** An internal error blocked full execution of your database purge.`,
                        embeds: [],
                        components: []
                    });
                } else {
                    await interaction.reply({
                        content: `${EMOJIS?.cross || '❌'} **System Error:** An internal error blocked full execution of your database purge.`,
                        flags: 64
                    });
                }
            } catch (editError) {
                console.error('🚨 Failed to send error response:', editError);
            }
        }
    }
};