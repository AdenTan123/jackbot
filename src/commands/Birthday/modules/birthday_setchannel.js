import { PermissionsBitField, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import path from 'path';
import { fileURLToPath } from 'url';
import { SlashCommandBuilder } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const name = path.basename(__filename, '.js');

export default {
  data: new SlashCommandBuilder().setName(name).setDescription('Removed module').setDMPermission(false),
  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: 'This subcommand has been removed.', ephemeral: true });
    } else {
      await interaction.followUp({ content: 'This subcommand has been removed.', ephemeral: true });
    }
  }
};
