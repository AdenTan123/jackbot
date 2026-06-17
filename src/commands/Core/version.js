import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Define your current bot version here. Update as needed.
const CURRENT_VERSION = 'v1.5.3';

export default {
  data: new SlashCommandBuilder()
    .setName('version')
    .setDescription('Check the current bot version and see if an update is available'),

  async execute(interaction) {
    try {
      const url = `https://version-jackbot.debbieng1677.workers.dev/?current=${encodeURIComponent(
        CURRENT_VERSION
      )}`;
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Version API returned ${response.status}`);
      }
      const { message, latest_version } = await response.json();

      const embed = createEmbed({
        title: '🤖 Bot Version',
        description: message,
        color: 'info',
      }).addFields({ name: 'Latest Version', value: latest_version, inline: true }).addFields({ name: 'Current Bot Version', value: CURRENT_VERSION, inline: true });

      await InteractionHelper.safeReply(interaction, { embeds: [embed] });
    } catch (err) {
      const errorEmbed = createEmbed({
        title: '❌ Version Check Failed',
        description: `Could not retrieve version information: ${err.message}`,
        color: 'error',
      });
      await InteractionHelper.safeReply(interaction, { embeds: [errorEmbed] });
    }
  },
};
