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
            // 🛠️ DATABASE DELETION - PERFORM GUILD DATA PURGE
            try {
                const start = Date.now();
                // Replace with your actual DB deletion function
                // Example for a Prisma client:
                await prisma.guild.delete({
                    where: { id: interaction.guildId }
                });
                // If you use a different DB driver, swap the line above for your call,
                // e.g. `await db.deleteGuildData(interaction.guildId);`
                const duration = Date.now() - start;
                console.log(`🔧 Guild data purge completed in ${duration}ms`);
            } catch (purgeError) {
                console.error('❗ Guild purge failed:', purgeError);
                // Pass the error to the outer catch block so the user gets an error reply
                throw purgeError;
            }
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