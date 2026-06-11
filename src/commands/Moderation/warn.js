import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/warningService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('moderation')
    .setDescription('Moderation warning tools')
    .addSubcommand(sub => sub
      .setName('warn')
      .setDescription('Warn a user')
      .addUserOption(o => o.setName('target').setDescription('User to warn').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('unwarn')
      .setDescription('Remove a warning by ID')
      .addUserOption(o => o.setName('target').setDescription('User to unwarn').setRequired(true))
      .addStringOption(o => o.setName('warning_id').setDescription('Warning ID to remove').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for removing warning')))
    .addSubcommand(sub => sub
      .setName('warnings')
      .setDescription('View all warnings for a user')
      .addUserOption(o => o.setName('target').setDescription('User to check').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  category: 'moderation',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn('Moderation interaction defer failed', {
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        throw new Error('You need the `Moderate Members` permission to use this command.');
      }

      // ── WARN ────────────────────────────────────────────────
      if (sub === 'warn') {
        const target = interaction.options.getUser('target');
        const member = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason');
        const moderator = interaction.user;

        if (!member) throw new Error('That user is not in this server.');

        const result = await WarningService.addWarning({
          guildId: interaction.guildId,
          userId: target.id,
          moderatorId: moderator.id,
          reason,
          timestamp: Date.now(),
        });

        if (!result.success) throw new Error('Failed to store warning in database.');

        await logModerationAction({
          client,
          guild: interaction.guild,
          event: {
            action: 'User Warned',
            target: `${target.tag} (${target.id})`,
            executor: `${moderator.tag} (${moderator.id})`,
            reason,
            metadata: {
              userId: target.id,
              moderatorId: moderator.id,
              totalWarns: result.totalCount,
              warningId: result.id,
            },
          },
        });

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            `**Reason:** ${reason}\n**Warning ID:** \`${result.id}\`\n**Total Warnings:** ${result.totalCount}`,
            `⚠️ Warned ${target.tag}`
          )],
        });
      }

      // ── UNWARN ──────────────────────────────────────────────
      else if (sub === 'unwarn') {
        const target = interaction.options.getUser('target');
        const warningId = parseInt(interaction.options.getString('warning_id'));
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const moderator = interaction.user;

        if (!target) throw new Error('Please provide the target user.');
        if (isNaN(warningId)) throw new Error('Invalid warning ID — must be a number.');

        const result = await WarningService.removeWarning(
          interaction.guildId,
          target.id,
          warningId
        );

        if (!result.success) throw new Error(`No warning found with ID \`${warningId}\`.`);

        const remaining = await WarningService.getWarnings(interaction.guildId, target.id);

        await logModerationAction({
          client,
          guild: interaction.guild,
          event: {
            action: 'Warning Removed',
            target: `${target.tag} (${target.id})`,
            executor: `${moderator.tag} (${moderator.id})`,
            reason,
            metadata: { warningId, moderatorId: moderator.id },
          },
        });

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            `**Warning ID:** \`${warningId}\`\n**Reason:** ${reason}\n**Remaining Warnings:** ${remaining.length}`,
            `✅ Warning Removed`
          )],
        });
      }

      // ── WARNINGS LIST ────────────────────────────────────────
      else if (sub === 'warnings') {
        const target = interaction.options.getUser('target');

        const warnings = await WarningService.getWarnings(interaction.guildId, target.id);

        if (!warnings.length) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('This user has no warnings.', `📋 Warnings for ${target.tag}`)],
          });
        }

        const list = warnings
          .map((w, i) =>
            `**${i + 1}.** \`ID: ${w.id}\`\n> **Reason:** ${w.reason}\n> **By:** <@${w.moderatorId}> • <t:${Math.floor(w.timestamp / 1000)}:R>`
          )
          .join('\n\n');

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            `${list}\n\n**Total:** ${warnings.length}`,
            `📋 Warnings for ${target.tag}`
          )],
        });
      }

    } catch (error) {
      logger.error('Moderation command error:', error);
      await handleInteractionError(interaction, error, { subtype: `${sub}_failed` });
    }
  },
};