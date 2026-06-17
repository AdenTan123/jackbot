import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('competition')
    .setDescription('Manage temporary competitions (start/end/category)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false) // 🛡️ CRITICAL: Prevents running this setup command in DMs (avoids null guildId crashes)
    .addSubcommand(s =>
      s
        .setName('start')
        .setDescription('Start accepting DM submissions')
    )
    .addSubcommand(s =>
      s
        .setName('end')
        .setDescription('End the competition and stop accepting submissions')
    )
    .addSubcommand(s =>
      s
        .setName('category')
        .setDescription('Set the competition submission category for this server')
        .addStringOption(o =>
          o
            .setName('category')
            .setDescription('Category name or ID to use for submissions')
            .setRequired(true)
        )
    ),

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
        comp.category = comp.category || '1513833221832572989'; // Sync property names
        comp.submissions = comp.submissions || {};
        
        await updateGuildConfig(interaction.client, guildId, { competition: comp });
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Competition started', 'Users may now DM the bot their image submissions.')]
        });
      }

      if (sub === 'end') {
        const cfg = await getGuildConfig(interaction.client, guildId).catch(() => ({}));
        const comp = cfg.competition || {};
        comp.active = false;
        await updateGuildConfig(interaction.client, guildId, { competition: comp });
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Competition ended', 'Submissions are now closed.')]
        });
      }

      if (sub === 'category') {
        const category = interaction.options.getString('category');
        const cfg = await getGuildConfig(interaction.client, guildId).catch(() => ({}));
        const comp = cfg.competition || {};
        
        // 🔄 Sync both tracking fields so your DM text processing file doesn't lose track of it
        comp.category = category;
        comp.categoryId = category; 
        
        await updateGuildConfig(interaction.client, guildId, { competition: comp });
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`Category set to ${category}`, 'You can now submit posters under this category.')]
        });
      }

      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed('Unknown subcommand')]
      });
    } catch (error) {
      logger.error('Competition command error', error);
      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed('Command failed', error.message || String(error))]
      });
    }
  }
};