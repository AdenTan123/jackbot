import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

function formatTimestamp(isoString) {
  if (!isoString) return '💤 Not currently clocked in';
  return `<t:${Math.floor(new Date(isoString).getTime() / 1000)}:F>`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('shift')
    .setDescription('🚀 Personal shift clock-in system')
    .addSubcommand(s => s
      .setName('manage')
      .setDescription('📱 Open your personal shift control panel'))
    .addSubcommand(s => s
      .setName('admin')
      .setDescription('👑 Manage another user\'s shift details')
      .addUserOption(o => o.setName('user').setDescription('The staff member to manage').setRequired(true))),

  async execute(interaction) {
    const ok = await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });
    if (!ok) return;

    const sub = interaction.options.getSubcommand();
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

    try {
      const cfg = await getGuildConfig(interaction.client, interaction.guildId).catch(() => ({}));
      const userShifts = cfg.userShifts || {};

      if (sub === 'manage') {
        const targetId = interaction.user.id;
        const currentShift = userShifts[targetId] || { status: 'Inactive', startedAt: null, duration: 0 };
        const statusLabel = { Active: '🟢 Clocked In', Paused: '🟡 Paused', Inactive: '🔴 Off Duty' }[currentShift.status] || '🔴 Off Duty';

        const embed = createEmbed({
          title: '⚡ Your Personal Shift Station',
          color: currentShift.status === 'Active' ? 'success' : currentShift.status === 'Paused' ? 'warning' : 'info',
          description: `Click the control buttons below to instantly update your status metrics.`,
          fields: [
            { name: '👤 Staff Member', value: `<@${targetId}>`, inline: true },
            { name: '📌 Current Status', value: statusLabel, inline: true },
            { name: '⏰ Current Session Started', value: formatTimestamp(currentShift.startedAt), inline: false },
            { name: '⏳ Total Saved Time', value: `⏱️ \`${currentShift.duration || 0} minutes\``, inline: true }
          ],
          timestamp: true
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`shift:manage:start:${targetId}`)
            .setLabel(currentShift.status === 'Paused' ? 'Resume Shift' : 'Clock In')
            .setEmoji(currentShift.status === 'Paused' ? '▶️' : '✨')
            .setStyle(ButtonStyle.Success)
            .setDisabled(currentShift.status === 'Active'),
          new ButtonBuilder()
            .setCustomId(`shift:manage:pause:${targetId}`)
            .setLabel('Pause')
            .setEmoji('⏸️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentShift.status !== 'Active'),
          new ButtonBuilder()
            .setCustomId(`shift:manage:end:${targetId}`)
            .setLabel('Clock Out')
            .setEmoji('🛑')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(currentShift.status === 'Inactive')
        );

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [row] });
      }

      if (sub === 'admin') {
        if (!isAdmin) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('⛔ Access Denied: Management authorization required.')]
          });
        }

        const targetUser = interaction.options.getUser('user', true);
        const currentShift = userShifts[targetUser.id] || { status: 'Inactive', startedAt: null, duration: 0 };
        const statusLabel = { Active: '🟢 Clocked In', Paused: '🟡 Paused', Inactive: '🔴 Off Duty' }[currentShift.status] || '🔴 Off Duty';

        const embed = createEmbed({
          title: '👑 Admin Shift Override Control',
          color: 'warning',
          description: `Remote system tools to modify records for <@${targetUser.id}>.`,
          fields: [
            { name: '👤 Target Staff', value: `<@${targetUser.id}>`, inline: true },
            { name: '📌 Status', value: statusLabel, inline: true },
            { name: '⏰ Session Start', value: formatTimestamp(currentShift.startedAt), inline: false },
            { name: '⏳ Saved Duration', value: `⏱️ \`${currentShift.duration || 0} minutes\``, inline: true }
          ],
          timestamp: true
        });

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`shift:admin:start:${targetUser.id}`)
            .setLabel(currentShift.status === 'Paused' ? 'Force Resume' : 'Force Clock In')
            .setEmoji('⚡')
            .setStyle(ButtonStyle.Success)
            .setDisabled(currentShift.status === 'Active'),
          new ButtonBuilder()
            .setCustomId(`shift:admin:pause:${targetUser.id}`)
            .setLabel('Force Pause')
            .setEmoji('⏸️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentShift.status !== 'Active'),
          new ButtonBuilder()
            .setCustomId(`shift:admin:end:${targetUser.id}`)
            .setLabel('Force Clock Out')
            .setEmoji('🛑')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(currentShift.status === 'Inactive')
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`shift:admin:set:${targetUser.id}`)
            .setLabel('Set Duration')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`shift:admin:add:${targetUser.id}`)
            .setLabel('Add Minutes')
            .setEmoji('➕')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`shift:admin:dec:${targetUser.id}`)
            .setLabel('Remove Minutes')
            .setEmoji('➖')
            .setStyle(ButtonStyle.Secondary)
        );

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [row1, row2] });
      }

    } catch (error) {
      logger.error('Shift system error:', error);
      return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('❌ Failed to construct UI dashboard state.')] });
    }
  }
};