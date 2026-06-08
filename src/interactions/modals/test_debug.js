import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

export default {
  name: 'test_debug_modal',
  async execute(interaction) {
    try {
      // Ensure interaction is usable
      const ready = await InteractionHelper.ensureReady(interaction, { flags: 1 << 6 });
      if (!ready) return;

      const allowedUserId = '1208248683746037760';
      if (interaction.user?.id !== allowedUserId) {
        await InteractionHelper.safeReply(interaction, { content: 'You are not authorized to submit this modal.', flags: 1 << 6 });
        return;
      }

      const submittedLogs = interaction.fields.getTextInputValue('dev_logs') || 'No logs submitted';

      // Save submitted logs to a timestamped file in logs/debug-submissions
      try {
        const logsDir = path.resolve(new URL('../../logs/debug-submissions', import.meta.url).pathname);
        await fs.mkdir(logsDir, { recursive: true }).catch(() => {});
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = path.join(logsDir, `submission-${timestamp}.log`);
        await fs.writeFile(filename, submittedLogs, 'utf8').catch((e) => logger.warn('Failed to save debug submission:', e.message || e));
      } catch (e) {
        logger.warn('Error while saving debug submission:', e.message || e);
      }

      const safeContent = submittedLogs.length > 1900 ? submittedLogs.slice(0, 1900) + '\n\n[truncated]' : submittedLogs;

      const embed = createEmbed({ title: 'Debug Test - Logs', description: 'Recent dev logs (truncated):' })
        .setDescription(`\n\n\`\`\`\n${safeContent}\n\`\`\``);

      await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: 1 << 6 });
    } catch (error) {
      logger.error('Error handling test_debug_modal submission:', error);
      try {
        await InteractionHelper.safeReply(interaction, { content: 'Failed to retrieve submitted logs.', flags: 1 << 6 });
      } catch (e) {
        logger.error('Failed to send error reply for test_debug_modal:', e);
      }
    }
  }
};
