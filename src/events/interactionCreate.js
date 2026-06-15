import { PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../services/guildConfig.js';
import { createEmbed, errorEmbed } from '../utils/embeds.js';

function formatTimestamp(isoString) {
  if (!isoString) return '💤 Not currently clocked in';
  return `<t:${Math.floor(new Date(isoString).getTime() / 1000)}:F>`;
}

// Reusable function to redraw the UI interface instantly
function renderUpdatedInterface(scope, targetId, shift) {
  const statusLabel = { Active: '🟢 Clocked In', Paused: '🟡 Paused', Inactive: '🔴 Off Duty' }[shift.status] || '🔴 Off Duty';

  if (scope === 'manage') {
    const embed = createEmbed({
      title: '⚡ Your Personal Shift Station',
      color: shift.status === 'Active' ? 'success' : shift.status === 'Paused' ? 'warning' : 'info',
      description: `Click the control buttons below to instantly update your status metrics.`,
      fields: [
        { name: '👤 Staff Member', value: `<@${targetId}>`, inline: true },
        { name: '📌 Current Status', value: statusLabel, inline: true },
        { name: '⏰ Current Session Started', value: formatTimestamp(shift.startedAt), inline: false },
        { name: '⏳ Total Saved Time', value: `⏱️ \`${shift.duration || 0} minutes\``, inline: true }
      ],
      timestamp: true
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`shift:manage:start:${targetId}`)
        .setLabel(shift.status === 'Paused' ? 'Resume Shift' : 'Clock In')
        .setEmoji(shift.status === 'Paused' ? '▶️' : '✨')
        .setStyle(ButtonStyle.Success)
        .setDisabled(shift.status === 'Active'),
      new ButtonBuilder()
        .setCustomId(`shift:manage:pause:${targetId}`)
        .setLabel('Pause')
        .setEmoji('⏸️')
        .setStyle(ButtonStyle.Warning)
        .setDisabled(shift.status !== 'Active'),
      new ButtonBuilder()
        .setCustomId(`shift:manage:end:${targetId}`)
        .setLabel('Clock Out')
        .setEmoji('🛑')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(shift.status === 'Inactive')
    );
    return { embeds: [embed], components: [row] };
  } else {
    // Admin interface layout
    const embed = createEmbed({
      title: '👑 Admin Shift Override Control',
      color: 'warning',
      description: `Remote system tools to modify records for <@${targetId}>.`,
      fields: [
        { name: '👤 Target Staff', value: `<@${targetId}>`, inline: true },
        { name: '📌 Status', value: statusLabel, inline: true },
        { name: '⏰ Session Start', value: formatTimestamp(shift.startedAt), inline: false },
        { name: '⏳ Saved Duration', value: `⏱️ \`${shift.duration || 0} minutes\``, inline: true }
      ],
      timestamp: true
    });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`shift:admin:start:${targetId}`)
        .setLabel(shift.status === 'Paused' ? 'Force Resume' : 'Force Clock In')
        .setEmoji('⚡')
        .setStyle(ButtonStyle.Success)
        .setDisabled(shift.status === 'Active'),
      new ButtonBuilder()
        .setCustomId(`shift:admin:pause:${targetId}`)
        .setLabel('Force Pause')
        .setEmoji('⏸️')
        .setStyle(ButtonStyle.Warning)
        .setDisabled(shift.status !== 'Active'),
      new ButtonBuilder()
        .setCustomId(`shift:admin:end:${targetId}`)
        .setLabel('Force Clock Out')
        .setEmoji('🛑')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(shift.status === 'Inactive')
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`shift:admin:set:${targetId}`)
        .setLabel('Set Duration')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`shift:admin:add:${targetId}`)
        .setLabel('Add Minutes')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`shift:admin:dec:${targetId}`)
        .setLabel('Remove Minutes')
        .setEmoji('➖')
        .setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row1, row2] };
  }
}

export default {
  name: 'interactionCreate',
  async execute(interaction) {

    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      try { await command.execute(interaction); } catch (e) { console.error(e); }
      return;
    }

    // ── 1. MODAL FORM SUBMISSIONS ────────────────────────────
    if (interaction.isModalSubmit()) {
      const [prefix, action, targetId] = interaction.customId.split(':');
      if (prefix !== 'shiftmodal') return;

      const cfg = await getGuildConfig(interaction.client, interaction.guildId).catch(() => ({}));
      cfg.userShifts = cfg.userShifts || {};
      const shift = cfg.userShifts[targetId] || { status: 'Inactive', startedAt: null, duration: 0 };
      
      const inputMinutes = parseInt(interaction.fields.getTextInputValue('minutes_input'), 10);
      if (isNaN(inputMinutes) || inputMinutes < 0) {
        return interaction.reply({ content: '❌ Invalid whole number input.', ephemeral: true });
      }

      if (action === 'set') shift.duration = inputMinutes;
      else if (action === 'add') shift.duration += inputMinutes;
      else if (action === 'dec') shift.duration = Math.max(0, shift.duration - inputMinutes);

      cfg.userShifts[targetId] = shift;
      await updateGuildConfig(interaction.client, interaction.guildId, { userShifts: cfg.userShifts });

      // Instantly redraw the admin panel view with updated times!
      const render = renderUpdatedInterface('admin', targetId, shift);
      return await interaction.update(render);
    }

    // ── 2. BUTTON INTERACTIONS ────────────────────────────────
    if (interaction.isButton()) {
      const [prefix, scope, action, targetId] = interaction.customId.split(':');
      if (prefix !== 'shift') return;

      try {
        const cfg = await getGuildConfig(interaction.client, interaction.guildId).catch(() => ({}));
        cfg.userShifts = cfg.userShifts || {};
        const shift = cfg.userShifts[targetId] || { status: 'Inactive', startedAt: null, duration: 0 };

        const save = async () => {
          cfg.userShifts[targetId] = shift;
          await updateGuildConfig(interaction.client, interaction.guildId, { userShifts: cfg.userShifts });
        };

        if (scope === 'admin' && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: '⛔ Admin permissions required.', ephemeral: true });
        }

        // ── PROCESS: CLOCK IN / RESUME ──────────────────────────
        if (action === 'start') {
          shift.status = 'Active';
          shift.startedAt = new Date().toISOString();
          await save();

          const render = renderUpdatedInterface(scope, targetId, shift);
          return await interaction.update(render);
        }

        // ── PROCESS: PAUSE SHIFT ────────────────────────────────
        if (action === 'pause') {
          if (shift.status === 'Active' && shift.startedAt) {
            const elapsedMs = new Date() - new Date(shift.startedAt);
            shift.duration += Math.floor(elapsedMs / 60000);
          }
          shift.status = 'Paused';
          shift.startedAt = null;
          await save();

          const render = renderUpdatedInterface(scope, targetId, shift);
          return await interaction.update(render);
        }

        // ── PROCESS: CLOCK OUT ──────────────────────────────────
        if (action === 'end') {
          if (shift.status === 'Active' && shift.startedAt) {
            const elapsedMs = new Date() - new Date(shift.startedAt);
            shift.duration += Math.floor(elapsedMs / 60000);
          }
          shift.status = 'Inactive';
          shift.startedAt = null;
          await save();

          const render = renderUpdatedInterface(scope, targetId, shift);
          return await interaction.update(render);
        }

        // ── PROCESS: SHOW TIME ADJUSTMENT MODALS ────────────────
        if (['set', 'add', 'dec'].includes(action)) {
          const modalTitles = { set: '⚙️ Set Total Time', add: '➕ Add Time Record', dec: '➖ Decrease Time Record' };
          const modalFields = { set: 'Enter exact minutes total:', add: 'Minutes to add:', dec: 'Minutes to subtract:' };

          const modal = new ModalBuilder()
            .setCustomId(`shiftmodal:${action}:${targetId}`)
            .setTitle(modalTitles[action]);

          const minutesInput = new TextInputBuilder()
            .setCustomId('minutes_input')
            .setLabel(modalFields[action])
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 15')
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(minutesInput));
          return await interaction.showModal(modal);
        }

      } catch (error) {
        console.error('System update framework failed:', error);
      }
    }
  },
};