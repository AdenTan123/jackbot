import { EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { setInDb } from '../../utils/database.js'; // 🔥 Added database integration
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

      // =========================================================================
      // 🔄 THRESHOLD CHECKING LAYER (Offer Replacement Option)
      // =========================================================================
      if (compConfig.submissions?.[interaction.user.id]) {
        const pendingKey = `competition_pending:${selectedGuildId}:${interaction.user.id}`;
        
        // Save the data to temporary DB cache so the replacement handler can find it
        await setInDb(pendingKey, {
          content: cachedData.content,
          url: cachedData.attachmentUrl || cachedData.content
        });

        const replacementButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`competition_replace:yes:${selectedGuildId}:${interaction.user.id}`)
            .setLabel('Yes, Replace It')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`competition_replace:no:${selectedGuildId}:${interaction.user.id}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

        return await interaction.update({
          content: `⚠️ **Submission Limit Reached:** You already reached the entry boundary (1/1) inside **${guild.name}**.\nWould you like to replace your previous submission with this new one?`,
          components: [replacementButtons]
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

      // 🔥 Captured the sent message object so we can read its messageId
      const sentMessage = await targetChannel.send({ embeds: [submissionEmbed] });

      // 🔥 Save proper structural metrics to the database layer (Required for the replacement script to work)
      compConfig.submissions = compConfig.submissions || {};
      compConfig.submissions[interaction.user.id] = {
        channelId: targetChannel.id,
        messageId: sentMessage.id,
        url: cachedData.attachmentUrl || cachedData.content
      };

      const fullConfig = await getGuildConfig(client, selectedGuildId).catch(() => ({}));
      fullConfig.competition = compConfig;
      await updateGuildConfig(client, selectedGuildId, fullConfig);

      // Clean session tracking reference structures
      client.tempSubmissions.delete(interaction.user.id);

      return await interaction.update({
        content: `✅ **Submission Locked & Forwarded Successfully to ${guild.name}!**`,
        components: []
      });

    } catch (err) {
      logger.error('Error running submission choice validation:', err);
      return await interaction.update({ content: "❌ An internal process error occurred while parsing your select choice.", components: [] }).catch(() => null);
    }
  }
};