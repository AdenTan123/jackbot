import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

function makeId() {
  return String(Date.now()).slice(-6);
}

function parseDateInput(input) {
  if (!input) return null;
  const t = Date.parse(input);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

export default {
  data: new SlashCommandBuilder()
    .setName('shift')
    .setDescription('Manage community shifts')
    .addSubcommand(s => s.setName('create').setDescription('Create a shift').addStringOption(o => o.setName('title').setDescription('Shift title').setRequired(true)).addStringOption(o => o.setName('start').setDescription('Start time (ISO or parseable)').setRequired(true)).addStringOption(o => o.setName('end').setDescription('End time (ISO or parseable)').setRequired(true)).addIntegerOption(o => o.setName('quota').setDescription('Max participants').setRequired(false)).addStringOption(o => o.setName('mode').setDescription('Mode: Active or Pause').addChoices({ name: 'Active', value: 'active' }, { name: 'Pause', value: 'pause' })))
    .addSubcommand(s => s.setName('list').setDescription('List upcoming shifts'))
    .addSubcommand(s => s.setName('join').setDescription('Join a shift by id').addStringOption(o => o.setName('id').setDescription('Shift id').setRequired(true)))
    .addSubcommand(s => s.setName('leave').setDescription('Leave a shift by id').addStringOption(o => o.setName('id').setDescription('Shift id').setRequired(true)))
    .addSubcommand(s => s.setName('cancel').setDescription('Cancel a shift you created (or admin)').addStringOption(o => o.setName('id').setDescription('Shift id').setRequired(true)))
    .addSubcommand(s => s.setName('reset').setDescription('Reset shifts; admin can reset all').addBooleanOption(o => o.setName('all').setDescription('Reset all shifts? (admin only)')))
    .addSubcommand(s => s.setName('admin_adjusttime').setDescription('Admin: add/subtract minutes to shift end').addStringOption(o => o.setName('id').setDescription('Shift id').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('Minutes to add (use negative to subtract)').setRequired(true)))
    .addSubcommand(s => s.setName('admin_setquota').setDescription('Admin: set quota for a shift').addStringOption(o => o.setName('id').setDescription('Shift id').setRequired(true)).addIntegerOption(o => o.setName('quota').setDescription('New quota (0 = unlimited)').setRequired(true)))
    .addSubcommand(s => s.setName('admin_remove').setDescription('Admin: remove a user from a shift').addStringOption(o => o.setName('id').setDescription('Shift id').setRequired(true)).addStringOption(o => o.setName('userid').setDescription('User id to remove').setRequired(true)))
    .setDefaultMemberPermissions(0),

  async execute(interaction) {
    const ok = await InteractionHelper.safeDefer(interaction);
    if (!ok) return;

    const sub = interaction.options.getSubcommand();

    try {
      const cfg = await getGuildConfig(interaction.client, interaction.guildId).catch(() => ({}));
      const shifts = Array.isArray(cfg.shifts) ? cfg.shifts : [];

      const saveShifts = async (newShifts) => {
        await updateGuildConfig(interaction.client, interaction.guildId, { shifts: newShifts });
      };

      if (sub === 'create') {
        const title = interaction.options.getString('title', true).trim();
        const startRaw = interaction.options.getString('start', true).trim();
        const endRaw = interaction.options.getString('end', true).trim();
        const quota = interaction.options.getInteger('quota') || 0;
        const mode = (interaction.options.getString('mode') || 'active').toLowerCase();

        const start = parseDateInput(startRaw);
        const end = parseDateInput(endRaw);
        if (!start || !end || end <= start) {
          return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Invalid dates', 'Please provide valid start and end times (end must be after start).')] });
        }

        const id = makeId();
        const shift = { id, title, start: start.toISOString(), end: end.toISOString(), quota: quota || 0, mode, creatorId: interaction.user.id, participants: [] };
        const newShifts = [shift, ...shifts];
        await saveShifts(newShifts);

        const embed = createEmbed({ title: `Shift created: ${title}`, description: `ID: ${id}` }).addFields({ name: 'Start', value: shift.start, inline: true }, { name: 'End', value: shift.end, inline: true }, { name: 'Quota', value: shift.quota ? String(shift.quota) : 'Unlimited', inline: true }, { name: 'Mode', value: shift.mode, inline: true });
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      if (sub === 'list') {
        if (shifts.length === 0) return await InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: 'Shifts', description: 'No upcoming shifts.' })] });
        const embeds = shifts.slice(0, 10).map(s => {
          const e = createEmbed({ title: s.title, description: `ID: ${s.id}` }).addFields({ name: 'Start', value: s.start || 'N/A', inline: true }, { name: 'End', value: s.end || 'N/A', inline: true }, { name: 'Mode', value: s.mode || 'active', inline: true }, { name: 'Participants', value: s.participants?.length ? s.participants.map(x => `<@${x}>`).join(', ') : 'None', inline: false });
          if (s.quota) e.addFields({ name: 'Quota', value: String(s.quota), inline: true });
          return e;
        });
        return await InteractionHelper.safeEditReply(interaction, { embeds });
      }

      if (sub === 'join' || sub === 'leave') {
        const id = interaction.options.getString('id', true).trim();
        const shift = shifts.find(s => s.id === id);
        if (!shift) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Not found', 'Shift ID not found.')] });
        if (shift.mode === 'pause') return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Paused', 'This shift is currently paused and cannot be joined.')] });

        const userId = interaction.user.id;
        const participants = Array.isArray(shift.participants) ? new Set(shift.participants) : new Set();

        if (sub === 'join') {
          if (shift.quota && participants.size >= shift.quota) {
            return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Full', 'This shift is full (quota reached).')] });
          }
          participants.add(userId);
          shift.participants = Array.from(participants);
          await saveShifts(shifts);
          return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Joined shift')] });
        } else {
          participants.delete(userId);
          shift.participants = Array.from(participants);
          await saveShifts(shifts);
          return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Left shift')] });
        }
      }

      if (sub === 'cancel') {
        const id = interaction.options.getString('id', true).trim();
        const shift = shifts.find(s => s.id === id);
        if (!shift) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Not found', 'Shift ID not found.')] });
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
        if (shift.creatorId !== interaction.user.id && !isAdmin) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Forbidden', 'Only the creator or a server admin can cancel this shift.')] });
        const newShifts = shifts.filter(s => s.id !== id);
        await saveShifts(newShifts);
        return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Shift cancelled')] });
      }

      if (sub === 'reset') {
        const all = interaction.options.getBoolean('all') || false;
        if (all) {
          if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Forbidden', 'You need Manage Server to reset all shifts.')] });
          await saveShifts([]);
          return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('All shifts reset')] });
        }
        // reset only shifts created by user
        const newShifts = shifts.filter(s => s.creatorId !== interaction.user.id);
        await saveShifts(newShifts);
        return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Your shifts reset')] });
      }

      if (sub === 'admin_adjusttime') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Forbidden', 'Admin only')] });
        const id = interaction.options.getString('id', true).trim();
        const minutes = interaction.options.getInteger('minutes', true);
        const shift = shifts.find(s => s.id === id);
        if (!shift) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Not found', 'Shift ID not found.')] });
        const end = new Date(shift.end);
        end.setMinutes(end.getMinutes() + Number(minutes));
        shift.end = end.toISOString();
        await saveShifts(shifts);
        return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Shift time adjusted')] });
      }

      if (sub === 'admin_setquota') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Forbidden', 'Admin only')] });
        const id = interaction.options.getString('id', true).trim();
        const quota = interaction.options.getInteger('quota', true) || 0;
        const shift = shifts.find(s => s.id === id);
        if (!shift) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Not found', 'Shift ID not found.')] });
        shift.quota = quota;
        await saveShifts(shifts);
        return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Quota updated')] });
      }

      if (sub === 'admin_remove') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Forbidden', 'Admin only')] });
        const id = interaction.options.getString('id', true).trim();
        const userid = interaction.options.getString('userid', true).trim();
        const shift = shifts.find(s => s.id === id);
        if (!shift) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Not found', 'Shift ID not found.')] });
        shift.participants = (shift.participants || []).filter(x => x !== userid);
        await saveShifts(shifts);
        return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('User removed')] });
      }

      return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Unknown', 'Unknown subcommand')] });
    } catch (error) {
      logger.error('Shift command error', error);
      return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Command failed', error.message || String(error))] });
    }
  }
};
