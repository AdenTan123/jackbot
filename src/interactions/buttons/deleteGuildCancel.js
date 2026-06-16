import { EMOJIS } from '../../config/emojis.js';

export default {
    name: 'delete_guild_cancel',

    async execute(interaction) {
        // Since the parent message is ephemeral, we don't need to validate the user object 
        // because Discord structurally blocks other users from seeing or clicking it anyway.
        await interaction.update({
            content: `${EMOJIS.cross} **Action Aborted:** Safe closure executed. No backend data profiles were modified.`,
            embeds: [],
            components: []
        });
    }
};