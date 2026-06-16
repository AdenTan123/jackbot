import { EMOJIS } from '../../config/emojis.js';

export default {
    name: 'delete_guild_cancel',

    async execute(interaction) {
        try {
            await interaction.update({
                content: `${EMOJIS?.cross || '❌'} **Action Aborted:** Safe closure executed. No backend data profiles were modified.`,
                embeds: [],
                components: []
            });
        } catch (error) {
            console.error('🚨 CANCEL BUTTON ERROR CRASH:', error);
        }
    }
};