import { EMOJIS } from '../../config/emojis.js';

export default {
    name: 'delete_guild_confirm',

    async execute(interaction) {
        // Fetch the user object of whoever initialized the parent slash command
        const originalUser = interaction.message.interaction?.user;

        // Block unauthorized interaction attempts
        if (originalUser && interaction.user.id !== originalUser.id) {
            return interaction.reply({
                content: `❌ This operation belongs to ${originalUser.username}. You cannot interact with it.`,
                ephemeral: true
            });
        }

        // Immediately defer the update since database wipes take time
        await interaction.deferUpdate();

        try {
            // --------------------------------------------------------
            // 📝 PLACE YOUR DATABASE DELETION QUERIES HERE
            // Example: await db.query('DELETE FROM guilds WHERE id = $1', [interaction.guildId]);
            // --------------------------------------------------------

            // Update original prompt indicating absolute execution success
            await interaction.editReply({
                content: `${EMOJIS.check} **Success:** All database structures associated with this guild have been permanently purged.`,
                components: [] // Removes buttons from layout
            });

        } catch (error) {
            console.error('Failed executing guild data wipe:', error);
            
            await interaction.editReply({
                content: `${EMOJIS.cross} **System Error:** An internal error blocked full execution of your database purge.`,
                components: []
            });
        }
    }
};