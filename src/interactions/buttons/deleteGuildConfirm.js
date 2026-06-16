import { MessageFlags } from 'discord.js';

export default {
    name: 'delete_guild_confirm',

    async execute(interaction) {
        try {
            const permissions = interaction.member?.permissions || interaction.memberPermissions;
            if (!permissions || !permissions.has('Administrator')) {
                return await interaction.reply({
                    content: '❌ Only administrators can confirm database purges.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // Immediately acknowledge the button click state
            await interaction.deferUpdate();

            // --------------------------------------------------------
            // 📝 PLACE YOUR DATABASE DELETION QUERIES HERE
            // Example: await db.query('DELETE FROM guilds WHERE id = $1', [interaction.guildId]);
            // --------------------------------------------------------

            await interaction.editReply({
                content: '✅ **Success:** All database structures associated with this guild have been permanently purged.',
                embeds: [], 
                components: [] 
            });

        } catch (error) {
            console.error('=== BUTTON CONFIRM ERROR ===');
            console.error(error);
            console.error('============================');
            
            await interaction.editReply({
                content: '❌ **System Error:** An internal error blocked full execution of your database purge.',
                embeds: [],
                components: []
            }).catch(() => {});
        }
    }
};