import { EMOJIS } from '../../config/emojis.js';

export default {
    name: 'delete_guild_confirm',

    async execute(interaction) {
        // Security check: Ensure the clicker is still an Administrator
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({
                content: '❌ Only administrators can confirm database purges.',
                ephemeral: true
            });
        }

        // Acknowledge the button click immediately
        await interaction.deferUpdate();

        try {
            // --------------------------------------------------------
            // 📝 PLACE YOUR DATABASE DELETION QUERIES HERE
            // Example: await db.query('DELETE FROM guilds WHERE id = $1', [interaction.guildId]);
            // --------------------------------------------------------

            // Update the original response, clearing out the old embed and replacing the components
            await interaction.editReply({
                content: `${EMOJIS.check} **Success:** All database structures associated with this guild have been permanently purged.`,
                embeds: [], 
                components: [] 
            });

        } catch (error) {
            console.error('Failed executing guild data wipe:', error);
            
            await interaction.editReply({
                content: `${EMOJIS.cross} **System Error:** An internal error blocked full execution of your database purge.`,
                embeds: [],
                components: []
            });
        }
    }
};