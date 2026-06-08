import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("mock")
    .setDescription("cOnVeRtS yOuR tExT tO sPoNgEbOb CaSe.")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("The text to mock.")
        .setRequired(true)
        .setMaxLength(1000),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      const originalText = interaction.options.getString("text");
      
      
      if (!originalText || originalText.trim().length === 0) {
        throw new TitanBotError(
          'Empty text provided to mock command',
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
      const embed = successEmbed("sPoNgEbOb cAsE", `"${mockedText}"`);



      await InteractionHelper.safeReply(interaction, { embeds: [embed] });
