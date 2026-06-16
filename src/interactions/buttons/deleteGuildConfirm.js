import { EMOJIS } from '../../config/emojis.js';
import logger from '../../utils/logger.js';

export default {
    name: 'delete_guild_confirm',

    async execute(interaction) {
        const traceId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        
        logger.info('🔄 DELETE_GUILD_CONFIRM: Button interaction received', {
            traceId,
            guildId: interaction.guildId,
            userId: interaction.user.id,
            userName: interaction.user.tag
        });

        try {
            // Check if interaction is already handled
            if (interaction.replied || interaction.deferred) {
                logger.warn('⚠️ DELETE_GUILD_CONFIRM: Interaction already handled', {
                    traceId,
                    isReplied: interaction.replied,
                    isDeferred: interaction.deferred
                });
                return;
            }

            // Check permissions
            const permissions = interaction.member?.permissions || interaction.memberPermissions;
            if (!permissions || !permissions.has('Administrator')) {
                logger.warn('🚫 DELETE_GUILD_CONFIRM: Permission denied', {
                    traceId,
                    userId: interaction.user.id
                });
                
                return interaction.reply({
                    content: '❌ Only administrators can confirm database purges.',
                    flags: 64
                });
            }

            // IMPORTANT: Defer the update FIRST
            logger.info('⏳ DELETE_GUILD_CONFIRM: Attempting deferUpdate', { traceId });
            await interaction.deferUpdate();
            logger.info('✅ DELETE_GUILD_CONFIRM: deferUpdate successful', { traceId });

            // 📝 PLACE YOUR DATABASE DELETION QUERIES HERE
            // Example: await db.query('DELETE FROM guilds WHERE id = $1', [interaction.guildId]);
            
            logger.info('🗄️ DELETE_GUILD_CONFIRM: Starting database purge', { traceId });
            
            // Simulate database operation
            await new Promise(resolve => setTimeout(resolve, 1000));

            logger.info('✅ DELETE_GUILD_CONFIRM: Database purge completed', { traceId });

            // Update the original message - THIS REPLACES THE EPHEMERAL WITH PERMANENT CONTENT
            await interaction.editReply({
                content: `${EMOJIS?.check || '✅'} **Success:** All database structures associated with this guild have been permanently purged.`,
                embeds: [],
                components: [] // This removes the buttons
            });

            logger.info('✅ DELETE_GUILD_CONFIRM: Message updated successfully', { traceId });

        } catch (error) {
            logger.error('💥 DELETE_GUILD_CONFIRM: Fatal error occurred', {
                traceId,
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack
            });

            try {
                // Try to update the original message with error
                await interaction.editReply({
                    content: `${EMOJIS?.cross || '❌'} **System Error:** An internal error blocked full execution of your database purge.`,
                    embeds: [],
                    components: []
                });
            } catch (editError) {
                logger.error('❌ DELETE_GUILD_CONFIRM: Error recovery failed', {
                    traceId,
                    errorName: editError.name,
                    errorMessage: editError.message
                });
            }
        }
    }
};