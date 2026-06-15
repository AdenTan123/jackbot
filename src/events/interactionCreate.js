import { PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../services/guildConfig.js';
import { successEmbed, errorEmbed, warningEmbed } from '../utils/embeds.js';

export default {
  name: 'interactionCreate',
  async execute(interaction) {
    
    // ── INTERACTION ROUTING: SLASH COMMANDS ───────────────────
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
      }
      return;
    }

    // ── INTERACTION ROUTING: BUTTONS ──────────────────────────
    if (interaction.isButton()) {
      // Break the custom ID string apart (e.g., 'shift:join:SH-123456')
      const [prefix, action, shiftId] = interaction.customId.split(':');
      
      // If the button wasn't created by our shift command, ignore it completely
      if (prefix !== 'shift') return;

      // Defer the button reaction immediately so Discord doesn't show an interaction error
      await interaction.deferReply({ ephemeral: true });

      try {
        const cfg = await getGuildConfig(interaction.client, interaction.guildId).catch(() => ({}));
        const shifts = Array.isArray(cfg.shifts) ? cfg.shifts : [];
        const shift = shifts.find(s => s.id === shiftId);

        if (!shift) {
          return interaction.editReply({ embeds: [errorEmbed('This shift no longer exists in the system.')] });
        }

        const saveShifts = async (newShifts) => {
          await updateGuildConfig(interaction.client, interaction.guildId, { shifts: newShifts });
        };

        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

        // ── BUTTON INTERACTION: JOIN ────────────────────────────
        if (action === 'join') {
          if (shift.mode !== 'active') {
            return interaction.editReply({ embeds: [errorEmbed(`This shift is currently **${shift.mode}** and cannot be joined.`)] });
          }
          const alreadyIn = shift.participants.some(p => p.userId === interaction.user.id);
          if (alreadyIn) {
            return interaction.editReply({ embeds: [warningEmbed('You are already registered in this shift.')] });
          }
          if (shift.quota && shift.participants.length >= shift.quota) {
            return interaction.editReply({ embeds: [errorEmbed('This shift has already hit its staff quota limit.')] });
          }

          shift.participants.push({ userId: interaction.user.id, joinedAt: new Date().toISOString() });
          await saveShifts(shifts);
          
          return interaction.editReply({ embeds: [successEmbed(`You have successfully joined **${shift.title}**!`)] });
        }

        // ── BUTTON INTERACTION: LEAVE ───────────────────────────
        if (action === 'leave') {
          const before = shift.participants.length;
          shift.participants = shift.participants.filter(p => p.userId !== interaction.user.id);

          if (shift.participants.length === before) {
            return interaction.editReply({ embeds: [warningEmbed('You are not clocked into this shift.')] });
          }

          await saveShifts(shifts);
          return interaction.editReply({ embeds: [successEmbed(`You have left **${shift.title}**.`)] });
        }

        // ── BUTTON INTERACTION: END ─────────────────────────────
        if (action === 'end') {
          if (shift.creatorId !== interaction.user.id && !isAdmin) {
            return interaction.editReply({ embeds: [errorEmbed('Only the shift host or an admin can end this shift.')] });
          }
          if (shift.mode === 'ended') {
            return interaction.editReply({ embeds: [warningEmbed('This shift has already been closed.')] });
          }

          shift.mode = 'ended';
          shift.endedAt = new Date().toISOString();
          await saveShifts(shifts);

          // Clear the physical buttons off the old embed message so people stop clicking them
          await interaction.message.edit({ components: [] }).catch(() => null);

          return interaction.editReply({ embeds: [successEmbed(`Shift **${shift.title}** has been closed.`)] });
        }

      } catch (error) {
        console.error('Persistent button error:', error);
        return interaction.editReply({ embeds: [errorEmbed('An internal error occurred while handling this click.')] });
      }
    }
  },
};