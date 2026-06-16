import { EMOJIS } from '../../config/emojis.js';
import logger from '../../utils/logger.js';

export default {
    name: 'delete_guild_cancel',

    async execute(interaction) {
        const traceId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        
        logger.info('🔄 DELETE_GUILD_CANCEL: Button interaction received', {
            traceId,
            guildId: interaction.guildId,
            userId: interaction.user.id
        });

        try {
            if (interaction.replied || interaction.deferred) {
                logger.warn('⚠️ DELETE_GUILD_CANCEL: Interaction already handled', { traceId });
                return;
            }

            // Defer the update first
            await interaction.deferUpdate();

            // Update the original message
            await interaction.editReply({
                content: `${EMOJIS?.cross || '❌'} **Action Aborted:** Safe closure executed. No backend data profiles were modified.`,
                embeds: [],
                components: []
            });

            logger.info('✅ DELETE_GUILD_CANCEL: Message updated successfully', { traceId });

        } catch (error) {
            logger.error('💥 DELETE_GUILD_CANCEL: Error occurred', {
                traceId,
                errorName: error.name,
                errorMessage: error.message
            });

            try {
                await interaction.reply({
                    content: '❌ An error occurred while cancelling the operation.',
                    flags: 64
                });
            } catch (replyError) {
                logger.error('💀 DELETE_GUILD_CANCEL: Failed to send error reply', {
                    traceId,
                    errorName: replyError.name,
                    errorMessage: replyError.message
                });
            }
        }
    }
};