import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('competition')
    .setDescription('Manage temporary competitions (start/end)')
    .addSubcommand(s => s.setName('start').setDescription('Start accepting DM submissions'))
    .addSubcommand(s => s.setName('end').setDescription('End the competition and stop accepting submissions'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const ok = await InteractionHelper.safeDefer(interaction);
    if (!ok) return;

    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      if (sub === 'start') {
        const cfg = await getGuildConfig(interaction.client, guildId).catch(() => ({}));
        const comp = cfg.competition || {};
        comp.active = true;
        comp.categoryId = comp.categoryId || '1513833221832572989';
        comp.submissions = comp.submissions || {};
        await updateGuildConfig(interaction.client, guildId, { competition: comp });
        return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Competition started', 'Users may now DM the bot their image submissions.')] });
      }

      if (sub === 'end') {
        const cfg = await getGuildConfig(interaction.client, guildId).catch(() => ({}));
        const comp = cfg.competition || {};
        comp.active = false;
        await updateGuildConfig(interaction.client, guildId, { competition: comp });
        return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Competition ended', 'Submissions are now closed.')] });
      }

      return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Unknown subcommand')] });
    } catch (error) {
      logger.error('Competition command error', error);
      return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Command failed', error.message || String(error))] });
    }
  }
};
