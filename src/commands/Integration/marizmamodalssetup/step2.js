import { MessageFlags } from 'discord.js';
import { updateGuildConfig, getGuildConfig } from '../../services/guildConfig.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export default {
  name: 'marizma_setup_step2',

  async execute(interaction, client) {
    try {
      const bannerTemplate = interaction.fields.getTextInputValue('marizma_banner_template').trim() || null;
      const sessionTitle = interaction.fields.getTextInputValue('marizma_session_title').trim() || null;
      const sessionBody = interaction.fields.getTextInputValue('marizma_session_body').trim() || null;
      const ssuMessage = interaction.fields.getTextInputValue('marizma_ssu_message').trim() || null;

      const existing = await getGuildConfig(client, interaction.guildId).catch(() => ({}));
      const existingMarizma = existing?.marizma ?? {};

      await updateGuildConfig(client, interaction.guildId, {
        marizma: {
          ...existingMarizma,
          ...(bannerTemplate ? { bannerTemplate } : {}),
          ...(sessionTitle ? { sessionTitle } : {}),
          ...(sessionBody ? { sessionBody } : {}),
          ...(ssuMessage ? { ssuMessage } : {}),
        },
      });

      await interaction.reply({
        embeds: [createEmbed({
          title: '✅ Marizma Setup Complete',
          color: 'success',
          fields: [
            {
              name: '🎫 Banner Template',
              value: bannerTemplate
                ? `\`\`\`${bannerTemplate.slice(0, 200)}\`\`\``
                : '*(unchanged)*',
              inline: false,
            },
            {
              name: '📋 Session Embed Title',
              value: sessionTitle || '*(unchanged)*',
              inline: true,
            },
            {
              name: '📝 Session Body',
              value: sessionBody
                ? `${sessionBody.slice(0, 100)}${sessionBody.length > 100 ? '...' : ''}`
                : '*(unchanged)*',
              inline: false,
            },
            {
              name: '📣 SSU Message',
              value: ssuMessage
                ? `${ssuMessage.slice(0, 100)}${ssuMessage.length > 100 ? '...' : ''}`
                : '*(unchanged)*',
              inline: false,
            },
            {
              name: '💡 Available Placeholders',
              value: '`{host}` `{cohost}` `{code}` `{link}` `{role}`',
              inline: false,
            },
          ],
          footer: { text: 'Run /setup view to see full config' },
          timestamp: true,
        })],
        flags: MessageFlags.Ephemeral,
      });

    } catch (error) {
      logger.error('Marizma setup step 2 modal error:', error);
      try {
        await interaction.reply({
          content: '❌ Failed to save session config. Please try again.',
          flags: MessageFlags.Ephemeral,
        });
      } catch {}
    }
  }
};