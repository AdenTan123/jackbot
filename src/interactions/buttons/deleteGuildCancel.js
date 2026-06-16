export default {
    name: 'delete_guild_cancel',

    async execute(interaction) {
        try {
            // Instantly clear out components and reset the text view frame
            await interaction.update({
                content: '❌ **Action Aborted:** Safe closure executed. No backend data profiles were modified.',
                embeds: [],
                components: []
            });
        } catch (error) {
            console.error('=== BUTTON CANCEL ERROR ===');
            console.error(error);
            console.error('===========================');
        }
    }
};