import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
function stringToHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export default {
    data: new SlashCommandBuilder()
    .setName("ship")
    .setDescription("Calculate the compatibility score between two people.")
    .addStringOption((option) =>
      option
        .setName("name1")
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
      const name2Raw = interaction.options.getString("name2");



      

      if (!name1Raw || name1Raw.trim().length === 0 || !name2Raw || name2Raw.trim().length === 0) {

        throw new TitanBotError(
