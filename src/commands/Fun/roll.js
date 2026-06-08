import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Rolls dice using standard notation (e.g., 2d20, 1d6 + 5).")
    .addStringOption((option) =>
      option
        .setName("notation")
        .setDescription("The dice notation (e.g., 2d6, 1d20 + 4)")
        .setRequired(true)
        .setMaxLength(50),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const notation = interaction.options
        .getString("notation")
        .toLowerCase()
        .replace(/\s/g, "");

      const match = notation.match(/^(\d*)d(\d+)([\+\-]\d+)?$/);

      if (!match) {
        throw new TitanBotError(
          import path from 'path';
          import { fileURLToPath } from 'url';
          import { SlashCommandBuilder } from 'discord.js';

          const __filename = fileURLToPath(import.meta.url);
          const name = path.basename(__filename, '.js');

          export default {
            data: new SlashCommandBuilder().setName(name).setDescription('Removed command').setDMPermission(false),
            category: 'Fun',
            async execute(interaction) {
              if (!interaction.deferred && !interaction.replied) {
                await interaction.reply({ content: 'This command has been removed.', ephemeral: true });
              } else {
                await interaction.followUp({ content: 'This command has been removed.', ephemeral: true });
              }
            }
          };


      if (numSides < 1 || numSides > 1000) {

        throw new TitanBotError(

          `Invalid number of sides: ${numSides}`,
