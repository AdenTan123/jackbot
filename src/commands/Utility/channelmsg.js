import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('channelmsg')
    .setDescription('Send a message as the bot to a channel')
    .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const ok = await InteractionHelper.safeDefer(interaction);
    if (!ok) return;

    try {
      const text = interaction.options.getString('message', true).trim();
      const channel = interaction.options.getChannel('channel', true);

      if (!channel) {
        return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Invalid channel', 'Please specify a valid channel.')] });
      }

      // Ensure channel can accept text
      const isText = typeof channel.isTextBased === 'function' ? channel.isTextBased() : (channel.send ? true : false);
      if (!isText) {
        return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Invalid channel', 'Please provide a text channel where I can send messages.')] });
      }

      const me = interaction.guild.members.me || (await interaction.guild.members.fetchMe?.());
      const perms = channel.permissionsFor ? channel.permissionsFor(me) : null;
      if (!perms || !perms.has(PermissionFlagsBits.SendMessages)) {
        return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Missing permission', 'I do not have permission to send messages in that channel.')] });
      }

      await channel.send({ content: text });
      return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Message sent')] });
    } catch (error) {
      logger.error('channelmsg command failed', error);
      return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to send', error.message || String(error))] });
    }
  }
};
