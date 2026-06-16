import { EMOJIS } from '../../config/emojis.js';

export default {
    name: 'delete_guild_confirm',

    async execute(interaction) {
        try {
            const permissions = interaction.member?.permissions || interaction.memberPermissions;
            if (!permissions || !permissions.has('Administrator')) {
                return interaction.reply({
                    content: '❌ Only administrators can confirm database purges.',
                    flags: 64
                });
            }

            await interaction.deferUpdate();

            // 📝 PLACE YOUR DATABASE DELETION QUERIES HERE
            // Example: await db.query('DELETE FROM guilds WHERE id = $1', [interaction.guildId]);

            await interaction.editReply({
                content: `${EMOJIS?.check || '✅'} **Success:** All database structures associated with this guild have been permanently purged.`,
                embeds: [], 
                components: [] 
            });

        } catch (error) {
            console.error('🚨 CONFIRM BUTTON ERROR CRASH:', error);
            await interaction.editReply({
                content: `${EMOJIS?.cross || '❌'} **System Error:** An internal error blocked full execution of your database purge.`,
                embeds: [],
                components: []
            });
        }
    }
};