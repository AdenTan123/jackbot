import { EMOJIS } from '../../config/emojis.js';
import logger from '../../utils/logger.js';

export default {
    name: 'delete_guild_cancel',

    async execute(interaction) {
        const traceId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        
        logger.info('🔄 DELETE_GUILD_CANCEL: Button interaction received', {
            traceId,
            guildId: interaction.guildId,
            userId: interaction.user.id,
            userName: interaction.user.tag,
            interactionType: interaction.type,
            isReplied: interaction.replied,
            isDeferred: interaction.deferred
        });

        try {
            logger.info('📝 DELETE_GUILD_CANCEL: Attempting to update message', {
                traceId,
                guildId: interaction.guildId,
                userId: interaction.user.id
            });

            await interaction.update({
                content: `${EMOJIS?.cross || '❌'} **Action Aborted:** Safe closure executed. No backend data profiles were modified.`,
                embeds: [],
                components: []
            });

            logger.info('✅ DELETE_GUILD_CANCEL: Message updated successfully', {
                traceId,
                guildId: interaction.guildId,
                userId: interaction.user.id
            });

        } catch (error) {
            logger.error('💥 DELETE_GUILD_CANCEL: Error occurred', {
                traceId,
                guildId: interaction.guildId,
                userId: interaction.user.id,
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack,
                interactionReplied: interaction.replied,
                interactionDeferred: interaction.deferred
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