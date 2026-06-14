import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

/**
 * /config counting <channelId> <deleteNonWords Y|N> <math Y|N>
 * Stores the counting game configuration in the guild config under `counting`.
 */
export default {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure bot features')
    .addSubcommand(sub =>
      sub
        .setName('counting')
        .setDescription('Setup a counting channel')
        .addStringOption(opt =>
          opt.setName('channelid').setDescription('ID of the channel for counting').setRequired(true))
        .addStringOption(opt =>
          opt.setName('deletenonwords')
            .setDescription('Delete messages that are not numbers or allowed math (Y/N)')
            .setRequired(true)
            .addChoices({ name: 'Yes', value: 'Y' }, { name: 'No', value: 'N' }))
        .addStringOption(opt =>
          opt.setName('math')
            .setDescription('Allow simple math expressions like "4+1" (Y/N)')
            .setRequired(true)
            .addChoices({ name: 'Yes', value: 'Y' }, { name: 'No', value: 'N' }))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)),

  /**
   * Saves the counting config into the guild's persisted config.
   */
  async execute(interaction) {
    const channelId = interaction.options.getString('channelid', true).trim();
    const deleteNonWords = interaction.options.getString('deletenonwords', true) === 'Y';
    const allowMath = interaction.options.getString('math', true) === 'Y';

    // Load existing guild config (or create a fresh object)
    const guildConfig = await getGuildConfig(interaction.client, interaction.guildId).catch(() => ({}));
    const updated = { ...guildConfig };
    updated.counting = {
      channelId,
      deleteNonWords,
      allowMath,
      // runtime state – persisted between restarts
      lastNumber: 0,
      lastUserId: null,
    };

    await setGuildConfig(interaction.client, interaction.guildId, updated);
    logger.info('Counting config saved', { guildId: interaction.guildId, channelId, deleteNonWords, allowMath });

    const embed = successEmbed('✅ Counting channel configured');
    embed.addFields({ name: 'Channel', value: `<#${channelId}>`, inline: true });
    embed.addFields({ name: 'Delete non‑words', value: deleteNonWords ? 'Yes' : 'No', inline: true });
    embed.addFields({ name: 'Allow math', value: allowMath ? 'Yes' : 'No', inline: true });

    await InteractionHelper.safeReply(interaction, { embeds: [embed] });
  },
};
