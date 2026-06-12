import {
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { getGuildConfig } from '../../services/guildConfig.js';

export default {
  name: 'marizma_open_step2',

  async execute(interaction, client) {
    const config = await getGuildConfig(client, interaction.guildId).catch(() => ({}));
    const marizma = config?.marizma ?? {};

    const modal = new ModalBuilder()
      .setCustomId('marizma_setup_step2')
      .setTitle('Marizma Setup (2/2)');

    const banner = new TextInputBuilder()
      .setCustomId('marizma_banner_template')
      .setLabel('Banner Template')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setPlaceholder('Hosted by {host} & {cohost}');

    const title = new TextInputBuilder()
      .setCustomId('marizma_session_title')
      .setLabel('Session Title')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('Server Start Up');

    const body = new TextInputBuilder()
      .setCustomId('marizma_session_body')
      .setLabel('Session Body')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setPlaceholder('{host} {cohost} {code}');

    const ssu = new TextInputBuilder()
      .setCustomId('marizma_ssu_message')
      .setLabel('SSU Message')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setPlaceholder('{host} {code} {role}');

    if (marizma.bannerTemplate) banner.setValue(marizma.bannerTemplate);
    if (marizma.sessionTitle) title.setValue(marizma.sessionTitle);
    if (marizma.sessionBody) body.setValue(marizma.sessionBody);
    if (marizma.ssuMessage) ssu.setValue(marizma.ssuMessage);

    modal.addComponents(
      new ActionRowBuilder().addComponents(banner),
      new ActionRowBuilder().addComponents(title),
      new ActionRowBuilder().addComponents(body),
      new ActionRowBuilder().addComponents(ssu)
    );

    await interaction.showModal(modal);
  },
};