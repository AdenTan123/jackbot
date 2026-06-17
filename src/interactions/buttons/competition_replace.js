import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getFromDb, deleteFromDb } from '../../utils/database.js'; // Ensure these match your database.js exports
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
  name: 'competition_replace',
  async execute(interaction) {
    try {
      // Parse the customId (format: competition_replace:choice:guildId:userId)
      const [_, choice, guildId, userId] = interaction.customId.split(':');

      if (!guildId || !userId) {
        return interaction.reply({ embeds: [errorEmbed('Error', 'Invalid replacement request.')], ephemeral: true });
      }

      // Security: Only the user who made the request can click "Yes"
      if (interaction.user.id !== userId) {
        return interaction.reply({ content: "❌ This is not your submission to replace.", ephemeral: true });
      }

      const pendingKey = `competition_pending:${guildId}:${userId}`;
      const pending = await getFromDb(pendingKey);

      if (!pending) {
        return interaction.reply({ embeds: [errorEmbed('Expired', 'Your pending submission request has expired.')], ephemeral: true });
      }

      if (choice === 'no') {
        await deleteFromDb(pendingKey);
        await interaction.message.delete().catch(() => {});
        return interaction.reply({ embeds: [successEmbed('Cancelled', 'Your previous submission remains unchanged.')], ephemeral: true });
      }

      // === Apply Replacement ===
      await interaction.deferUpdate(); // Defer because channel operations can take time

      const cfg = await getGuildConfig(interaction.client, guildId).catch(() => ({}));
      const comp = cfg.competition || {};
      const submissions = comp.submissions || {};
      const existing = submissions[userId];

      if (!existing) {
        await deleteFromDb(pendingKey);
        return interaction.followUp({ embeds: [errorEmbed('Not found', 'Original submission not found.')], ephemeral: true });
      }

      try {
        const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
        if (!guild) throw new Error('Guild not accessible');

        const ch = await guild.channels.fetch(existing.channelId).catch(() => null);
        
        // 1. Try to delete the OLD submission message specifically
        if (ch && existing.messageId) {
          const oldMsg = await ch.messages.fetch(existing.messageId).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => null);
        }

        // 2. Send the NEW submission message
        const sent = await ch.send({ 
            content: `**Updated Submission from <@${userId}>**`,
            files: pending.url.startsWith('http') ? [pending.url] : [],
            embeds: [/* You can reconstruct the embed here if you saved it, or just send raw content */]
        }).catch(err => { throw err; });

        // 3. Update the config with the new message ID and URL
        submissions[userId] = { 
            channelId: ch.id, 
            messageId: sent?.id || null, 
            url: pending.url 
        };
        
        comp.submissions = submissions;
        await updateGuildConfig(interaction.client, guildId, { competition: comp }).catch(() => {});
        
        // 4. Cleanup
        await deleteFromDb(pendingKey);
        await interaction.message.delete().catch(() => {});
        
        return interaction.followUp({ embeds: [successEmbed('Replaced', 'Your submission has been replaced.')], ephemeral: true });
      } catch (error) {
        logger.error('Failed to apply competition replacement:', error);
        await deleteFromDb(pendingKey);
        return interaction.followUp({ embeds: [errorEmbed('Replacement failed', 'Could not replace submission.')], ephemeral: true });
      }
    } catch (error) {
      logger.error('competition_replace button handler error', error);
      return interaction.reply({ embeds: [errorEmbed('Error', 'An error occurred handling your request.')], ephemeral: true });
    }
  }
};