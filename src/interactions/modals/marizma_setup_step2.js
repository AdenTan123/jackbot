import { updateGuildConfig, getGuildConfig } from '../../services/guildConfig.js';
import { MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';

export default {
  name: 'marizma_setup_step2',

  async execute(interaction, client) {
    try {
      const banner = interaction.fields.getTextInputValue('marizma_banner_template');
      const title = interaction.fields.getTextInputValue('marizma_session_title');
      const body = interaction.fields.getTextInputValue('marizma_session_body');
      const ssu = interaction.fields.getTextInputValue('marizma_ssu_message');

      const existing = await getGuildConfig(client, interaction.guildId).catch(() => ({}));

      await updateGuildConfig(client, interaction.guildId, {
        marizma: {
          ...existing.marizma,
          bannerTemplate: banner,
          sessionTitle: title,
          sessionBody: body,
          ssuMessage: ssu,
        },
      });

      await interaction.reply({
        content: '✅ Setup complete (2/2)! System is now configured.',
        flags: MessageFlags.Ephemeral,
      });

    } catch (error) {
      logger.error(error);

      if (!interaction.replied) {
        await interaction.reply({
          content: '❌ Failed Step 2 setup.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};