import { PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../services/guildConfig.js';
import { successEmbed, errorEmbed, warningEmbed } from '../utils/embeds.js';

export default {
  name: 'interactionCreate',
  async execute(interaction) {

    // ── 1. SLASH COMMANDS ROUTER ──────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      try { await command.execute(interaction); } catch (e) { console.error(e); }
      return;
    }

    // ── 2. MODAL POP-UP SUBMISSIONS ───────────────────────────
    if (interaction.isModalSubmit()) {
      const [prefix, action, targetId] = interaction.customId.split(':');
      if (prefix !== 'shiftmodal') return;

      await interaction.deferReply({ ephemeral: true });
      
      const cfg = await getGuildConfig(interaction.client, interaction.guildId).catch(() => ({}));
      cfg.userShifts = cfg.userShifts || {};
      const shift = cfg.userShifts[targetId] || { status: 'Inactive', startedAt: null, duration: 0 };
      
      const inputMinutes = parseInt(interaction.fields.getTextInputValue('minutes_input'), 10);
      if (isNaN(inputMinutes) || inputMinutes < 0) {
        return interaction.editReply({ embeds: [errorEmbed('Please input a valid positive whole number of minutes.')] });
      }

      if (action === 'set') {
        shift.duration = inputMinutes;
      } else if (action === 'add') {
        shift.duration += inputMinutes;
      } else if (action === 'dec') {
        shift.duration = Math.max(0, shift.duration - inputMinutes);
      }

      cfg.userShifts[targetId] = shift;
      await updateGuildConfig(interaction.client, interaction.guildId, { userShifts: cfg.userShifts });

      return interaction.editReply({ 
        embeds: [successEmbed(`Successfully adjusted <@${targetId}>'s total shift time to **${shift.duration} minutes**.`)] 
      });
    }

    // ── 3. BUTTON CLICK ACTIONS ───────────────────────────────
    if (interaction.isButton()) {
      const [prefix, scope, action, targetId] = interaction.customId.split(':');
      if (prefix !== 'shift') return;

      // Special Gate: Modals CANNOT be responded to with a deferred reply. 
      // If we are throwing a modal popup, don't trigger interaction.deferReply yet!
      const isModalAction = ['set', 'add', 'dec'].includes(action);
      if (!isModalAction) {
        await interaction.deferReply({ ephemeral: true });
      }

      try {
        const cfg = await getGuildConfig(interaction.client, interaction.guildId).catch(() => ({}));
        cfg.userShifts = cfg.userShifts || {};
        const shift = cfg.userShifts[targetId] || { status: 'Inactive', startedAt: null, duration: 0 };

        const save = async () => {
          cfg.userShifts[targetId] = shift;
          await updateGuildConfig(interaction.client, interaction.guildId, { userShifts: cfg.userShifts });
        };

        // Security check for admin scope
        if (scope === 'admin' && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.editReply({ embeds: [errorEmbed('Access Denied: You do not have permissions to modify sheets.')] });
        }

        // ── BUTTON CLICK: START ─────────────────────────────────
        if (action === 'start') {
          if (shift.status === 'Active') {
            return interaction.editReply({ embeds: [warningEmbed('This profile is already clocked into an active shift.')] });
          }
          shift.status = 'Active';
          shift.startedAt = new Date().toISOString();
          await save();
          return interaction.editReply({ embeds: [successEmbed(`<@${targetId}> has successfully clocked into their shift.`)] });
        }

        // ── BUTTON CLICK: END ───────────────────────────────────
        if (action === 'end') {
          if (shift.status !== 'Active') {
            return interaction.editReply({ embeds: [warningEmbed('This profile does not have an active shift running.')] });
          }
          
          // Math: calculate active minutes elapsed
          const elapsedMs = new Date() - new Date(shift.startedAt);
          const elapsedMinutes = Math.floor(elapsedMs / 60000);

          shift.status = 'Inactive';
          shift.duration += elapsedMinutes;
          shift.startedAt = null;
          await save();

          return interaction.editReply({ 
            embeds: [successEmbed(`<@${targetId}> has clocked out! Added **${elapsedMinutes}m** to records. Total: **${shift.duration}m**.`)] 
          });
        }

        // ── BUTTON CLICK: TRIGGER MODAL POPUPS (SET/ADD/DECREASE) ──
        if (isModalAction) {
          const modalTitles = { set: 'Set Total Time', add: 'Add Time Record', dec: 'Decrease Time Record' };
          const modalFields = { set: 'Enter exact minutes total:', add: 'Minutes to add:', dec: 'Minutes to subtract:' };

          const modal = new ModalBuilder()
            .setCustomId(`shiftmodal:${action}:${targetId}`)
            .setTitle(modalTitles[action]);

          const minutesInput = new TextInputBuilder()
            .setCustomId('minutes_input')
            .setLabel(modalFields[action])
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 45')
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(minutesInput));
          return await interaction.showModal(modal);
        }

      } catch (error) {
        console.error('System process crash:', error);
        if (!isModalAction) {
          return interaction.editReply({ embeds: [errorEmbed('A critical failure occurred during state mapping.')] });
        }
      }
    }
  },
};