import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

function formatTimestamp(isoString) {
  if (!isoString) return 'Not started';
  return `<t:${Math.floor(new Date(isoString).getTime() / 1000)}:F>`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('shift')
    .setDescription('Personal shift clock-in system')
    
    // /shift manage
    .addSubcommand(s => s
      .setName('manage')
      .setDescription('Open your personal shift control panel'))
      
    // /shift admin <user>
    .addSubcommand(s => s
      .setName('admin')
      .setDescription('Manage another user\'s shift details')
      .addUserOption(o => o.setName('user').setDescription('The staff member to manage').setRequired(true))),

  async execute(interaction) {
    const ok = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
    if (!ok) return;

    const sub = interaction.options.getSubcommand();
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

    try {
      const cfg = await getGuildConfig(interaction.client, interaction.guildId).catch(() => ({}));
      const userShifts = cfg.userShifts || {};

      // ── TYPE 1: PERSONAL MANAGEMENT ───────────────────────────
      if (sub === 'manage') {
        const targetId = interaction.user.id;
        const currentShift = userShifts[targetId] || { status: 'Inactive', startedAt: null, duration: 0 };

        const embed = createEmbed({
          title: '⏱️ Your Shift Control Panel',
          color: currentShift.status === 'Active' ? 'success' : 'info',
          description: `Manage your active working hours using the quick buttons below.`,
          fields: [
            { name: '👤 Staff Member', value: `<@${targetId}>`, inline: true },
            { name: '📌 Current Status', value: currentShift.status === 'Active' ? '🟢 Active' : '🔴 Inactive', inline: true },
            { name: '⏰ Clocked In At', value: formatTimestamp(currentShift.startedAt), inline: false },
            { name: '⏳ Accumulated Time', value: `\`${currentShift.duration || 0} minutes\``, inline: true }
          ],
          timestamp: true
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`shift:manage:start:${targetId}`)
            .setLabel('Start Shift')
            .setStyle(ButtonStyle.Success)
            .setDisabled(currentShift.status === 'Active'),
          new ButtonBuilder()
            .setCustomId(`shift:manage:end:${targetId}`)
            .setLabel('End Shift')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(currentShift.status !== 'Active')
        );

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [row] });
      }

      // ── TYPE 2: ADMIN MANAGEMENT ──────────────────────────────
      if (sub === 'admin') {
        if (!isAdmin) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('You need management permissions to use the admin control suite.')]
          });
        }

        const targetUser = interaction.options.getUser('user', true);
        const currentShift = userShifts[targetUser.id] || { status: 'Inactive', startedAt: null, duration: 0 };

        const embed = createEmbed({
          title: '🛠️ Admin Shift Override Suite',
          color: 'warning',
          description: `Administrative controls for managing <@${targetUser.id}>'s active time sheet.`,
          fields: [
            { name: '👤 Target Staff', value: `<@${targetUser.id}>`, inline: true },
            { name: '📌 Status', value: currentShift.status === 'Active' ? '🟢 Active' : '🔴 Inactive', inline: true },
            { name: '⏰ Clock In', value: formatTimestamp(currentShift.startedAt), inline: false },
            { name: '⏳ Saved Duration', value: `\`${currentShift.duration || 0} minutes\``, inline: true }
          ],
          timestamp: true
        });

        // Row 1: Quick status manipulation
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`shift:admin:start:${targetUser.id}`)
            .setLabel('Force Start')
            .setStyle(ButtonStyle.Success)
            .setDisabled(currentShift.status === 'Active'),
          new ButtonBuilder()
            .setCustomId(`shift:admin:end:${targetUser.id}`)
            .setLabel('Force End')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(currentShift.status !== 'Active')
        );

        // Row 2: Time modification math buttons
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`shift:admin:set:${targetUser.id}`)
            .setLabel('Set Duration')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`shift:admin:add:${targetUser.id}`)
            .setLabel('Add Duration')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`shift:admin:dec:${targetUser.id}`)
            .setLabel('Decrease Duration')
            .setStyle(ButtonStyle.Secondary)
        );

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [row1, row2] });
      }

    } catch (error) {
      logger.error('Shift system error:', error);
      return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to open management interface.')] });
    }
  }
};