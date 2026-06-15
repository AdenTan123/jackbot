import { EMOJIS } from '../../config/emojis.js';

export default {
    name: 'delete_guild_cancel',

    async execute(interaction) {
        const originalUser = interaction.message.interaction?.user;

        if (originalUser && interaction.user.id !== originalUser.id) {
            return interaction.reply({
                content: '❌ You cannot cancel an operation you did not initiate.',
                ephemeral: true
            });
        }

        // Wipe component nodes and flag process termination gracefully
        await interaction.update({
            content: `${EMOJIS.cross} **Action Aborted:** Safe closure executed. No backend data profiles were modified.`,
            components: []
        });
    }
};