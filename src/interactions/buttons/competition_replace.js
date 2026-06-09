import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getFromDb, deleteFromDb } from '../../utils/database.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
  name: 'competition_replace',
  async execute(interaction, client, args) {
    try {
      const choice = args[0]; // 'yes' or 'no'
      const guildId = args[1];
      const userId = args[2];

      if (!guildId || !userId) {
        return interaction.reply({ embeds: [errorEmbed('Error', 'Invalid replacement request.')], ephemeral: true });
      }

      const pendingKey = `competition_pending:${guildId}:${userId}`;
      const pending = await getFromDb(pendingKey, null);

      if (!pending) {
        return interaction.reply({ embeds: [errorEmbed('No pending submission', 'There is no pending submission to apply.')], ephemeral: true });
      }

      if (choice === 'no') {
        await deleteFromDb(pendingKey);
        try { await interaction.message.edit({ components: [] }).catch(() => {}); } catch(e){}
        return interaction.reply({ embeds: [successEmbed('Cancelled', 'Your previous submission remains unchanged.')], ephemeral: true });
      }

      // apply replacement
      const cfg = await getGuildConfig(client, guildId).catch(() => ({}));
      const comp = cfg.competition || {};
      const submissions = comp.submissions || {};
      const existing = submissions[userId];

      if (!existing) {
        await deleteFromDb(pendingKey);
        return interaction.reply({ embeds: [errorEmbed('Not found', 'Original submission not found.')], ephemeral: true });
      }

      try {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) throw new Error('Guild not accessible');

        const ch = await guild.channels.fetch(existing.channelId).catch(() => null);
        if (!ch) throw new Error('Submission channel not found');

        // remove previous messages in the channel
        try {
          let fetched;
          do {
            fetched = await ch.messages.fetch({ limit: 100 }).catch(() => null);
            if (!fetched || fetched.size === 0) break;
            const deletable = fetched.filter(m => (Date.now() - m.createdTimestamp) < 14 * 24 * 60 * 60 * 1000);
            if (deletable.size > 0) await ch.bulkDelete(deletable, true).catch(() => null);
            else break;
          } while (fetched && fetched.size > 0);
        } catch (purgeErr) {
          logger.warn('Failed to purge previous submission messages:', purgeErr?.message || purgeErr);
        }

        const sent = await ch.send({ files: [pending.url], content: `Submission replacement from <@${userId}>` }).catch(err => { throw err; });

        submissions[userId] = { channelId: ch.id, messageId: sent?.id || null, url: pending.url };
        comp.submissions = submissions;
        await updateGuildConfig(client, guildId, { competition: comp }).catch(() => {});
        await deleteFromDb(pendingKey);
        try { await interaction.message.edit({ components: [] }).catch(() => {}); } catch(e){}
        return interaction.reply({ embeds: [successEmbed('Replaced', 'Your submission has been replaced.')], ephemeral: true });
      } catch (error) {
        logger.error('Failed to apply competition replacement:', error);
        await deleteFromDb(pendingKey);
        return interaction.reply({ embeds: [errorEmbed('Replacement failed', 'Could not replace submission.')], ephemeral: true });
      }
    } catch (error) {
      logger.error('competition_replace button handler error', error);
      return interaction.reply({ embeds: [errorEmbed('Error', 'An error occurred handling your request.')], ephemeral: true });
    }
  }
};
