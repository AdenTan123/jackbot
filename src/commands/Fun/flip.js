import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
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
      await InteractionHelper.safeReply(interaction, { embeds: [embed] });

      logger.debug(`Flip command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);

    } catch (error) {

      logger.error('Flip command error:', error);
