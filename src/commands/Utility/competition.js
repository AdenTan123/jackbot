import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('competition')
    .setDescription('Manage temporary competitions (start/end/category)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s =>
      s
        .setName('start')
        .setDescription('Start accepting DM submissions with specific format rules')
        .addStringOption(o =>
          o
            .setName('event_type')
            .setDescription('The required entry format type')
            .setRequired(true)
            .addChoices(
              { name: 'Attachment (Images/Files)', value: 'attachment' },
              { name: 'Link (URLs)', value: 'link' },
              { name: 'Message (Text)', value: 'message' }
            )
        )
        .addIntegerOption(o =>
          o
            .setName('submissions_amt')
            .setDescription('Maximum entry limit per user (1-5)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(5)
        )
    )
    .addSubcommand(s =>
      s
        .setName('end')
        .setDescription('End the competition and stop accepting submissions')
    )
    .addSubcommand(s =>
      s
        .setName('category')
        .setDescription('Set the competition submission channel/category for this server')
        .addStringOption(o =>
          o
            .setName('category')
            .setDescription('Channel name or ID to use for submissions')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const ok = await InteractionHelper.safeDefer(interaction);
    if (!ok) return;

    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      if (sub === 'start') {
        const eventType = interaction.options.getString('event_type');
        const submissionsAmt = interaction.options.getInteger('submissions_amt');

        const cfg = await getGuildConfig(interaction.client, guildId).catch(() => ({}));
        const comp = cfg.competition || {};
        
        // 🛡️ MULTI-GUILD SAFEGUARD: Force them to assign a unique local channel first!
        if (!comp.categoryId && !comp.category) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(
              'Configuration Channel Missing', 
              'You must configure a logging target channel for this specific server first!\n\nRun `/competition category category:<channel_id>` before starting the event.'
            )]
          });
        }
        
        comp.active = true;
        comp.eventType = eventType;
        comp.maxSubmissions = submissionsAmt;
        comp.submissions = comp.submissions || {}; 

        await updateGuildConfig(interaction.client, guildId, { competition: comp });
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            'Competition Started Successfully', 
            `**Allowed Format:** ${eventType.toUpperCase()}\n**Max Entries Per User:** ${submissionsAmt}\n\nUsers may now DM entries directly to the bot.`
          )]
        });
      }

      if (sub === 'end') {
        const cfg = await getGuildConfig(interaction.client, guildId).catch(() => ({}));
        const comp = cfg.competition || {};
        comp.active = false;
        await updateGuildConfig(interaction.client, guildId, { competition: comp });
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Competition Ended', 'Submissions are now closed.')]
        });
      }

      if (sub === 'category') {
        const category = interaction.options.getString('category');
        const cfg = await getGuildConfig(interaction.client, guildId).catch(() => ({}));
        const comp = cfg.competition || {};
        
        // Clean off any brackets or formatting if they pasted raw channel mentions like <#1234>
        const cleanId = category.replace(/[<#>]/g, '');
        
        comp.category = cleanId;
        comp.categoryId = cleanId; 
        
        await updateGuildConfig(interaction.client, guildId, { competition: comp });
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`Category channel configured!`, `Submissions for this server will now route to channel ID: \`${cleanId}\`.`)]
        });
      }

      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed('Unknown subcommand')]
      });
    } catch (error) {
      logger.error('Competition command error', error);
      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed('Command failed', error.message || String(error))]
      });
    }
  }
};