import { EmbedBuilder, ChannelType } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
  name: 'competition_guild_select',

  async execute(interaction) {
    try {
      const selectedGuildId = interaction.values[0];
      const client = interaction.client;

      // Extract details from temporary cache mapping structures
      const cachedData = client.tempSubmissions?.get(interaction.user.id);
      if (!cachedData) {
        return await interaction.update({
          content: "❌ **Session Expired:** Unable to retrieve your entry content elements. Please upload or write your submission again.",
          components: []
        });
      }

      const guild = client.guilds.cache.get(selectedGuildId);
      if (!guild) {
        return await interaction.update({ content: "❌ Unable to verify mutual server routing connections.", components: [] });
      }

      const cfg = await getGuildConfig(client, selectedGuildId).catch(() => null);
      const compConfig = cfg?.competition;

      if (!compConfig || !compConfig.active) {
        return await interaction.update({ content: "❌ The competition on that server has recently been closed.", components: [] });
      }

      // Execution Layer: Rule checking constraints matching selection metrics
      if (compConfig.eventType === 'attachment' && !cachedData.attachmentUrl) {
        return await interaction.update({ content: `❌ **Format Mismatch:** **${guild.name}** requires an image or file attachment to join. Resend your entry with a file attached to enter.`, components: [] });
      }
      if (compConfig.eventType === 'link' && (!cachedData.content || !/https?:\/\/[^\s]+/.test(cachedData.content))) {
        return await interaction.update({ content: `❌ **Format Mismatch:** **${guild.name}** requires an entry containing a URL link. Please copy a valid link layout to enter.`, components: [] });
      }
      if (compConfig.eventType === 'message' && (!cachedData.content || cachedData.content.trim().length === 0)) {
        return await interaction.update({ content: `❌ **Format Mismatch:** **${guild.name}** requires clear text message content to register.`, components: [] });
      }

      // Threshold Checking Layer
      const currentEntries = compConfig.submissions?.[interaction.user.id] || 0;
      if (currentEntries >= (compConfig.maxSubmissions || 1)) {
        return await interaction.update({
          content: `❌ **Submission Limit Reached:** You already reached the entry boundary (${currentEntries}/${compConfig.maxSubmissions || 1}) inside **${guild.name}**.`,
          components: []
        });
      }

      // Output Target Channel Core Resolver
      let targetId = compConfig.categoryId || compConfig.category;
      let targetChannel = await client.channels.fetch(targetId).catch(() => null);

      if (!targetChannel) {
        return await interaction.update({ content: "❌ The logging destination channel is currently locked inside that server.", components: [] });
      }

      if (targetChannel.type === ChannelType.GuildCategory || !targetChannel.send) {
        const textInside = targetChannel.guild?.channels.cache.find(ch => ch.parentId === targetChannel.id && ch.isTextBased());
        if (textInside) targetChannel = textInside;
      }

      // Construct and dispatch layout payload
      const submissionEmbed = new EmbedBuilder()
        .setColor('#00FF66')
        .setTitle(`📥 Competition Submission | ${guild.name}`)
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
        .setDescription(`**User:** <@${interaction.user.id}> (${interaction.user.id})\n\n**Content:**\n${cachedData.content || '*No text message content provided.*'}`)
        .setTimestamp();

      if (cachedData.attachmentUrl) submissionEmbed.setImage(cachedData.attachmentUrl);

      await targetChannel.send({ embeds: [submissionEmbed] });

      // Save independent tracking metrics to database structure layer
      compConfig.submissions = compConfig.submissions || {};
      compConfig.submissions[interaction.user.id] = currentEntries + 1;

      const fullConfig = await getGuildConfig(client, selectedGuildId).catch(() => ({}));
      fullConfig.competition = compConfig;
      await updateGuildConfig(client, selectedGuildId, fullConfig);

      // Clean session tracking reference structures
      client.tempSubmissions.delete(interaction.user.id);

      return await interaction.update({
        content: `✅ **Submission Locked & Forwarded Successfully to ${guild.name}!** (${currentEntries + 1}/${compConfig.maxSubmissions || 1})`,
        components: []
      });

    } catch (err) {
      logger.error('Error running submission choice validation:', err);
      return await interaction.update({ content: "❌ An internal process error occurred while parsing your select choice.", components: [] }).catch(() => null);
    }
  }
};