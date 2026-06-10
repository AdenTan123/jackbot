import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

function makeId() {
  return `SH-${String(Date.now()).slice(-6)}`;
}

function parseDateInput(input) {
  if (!input) return null;
  const t = Date.parse(input);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '0m';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatTimestamp(isoString) {
  if (!isoString) return 'N/A';
  return `<t:${Math.floor(new Date(isoString).getTime() / 1000)}:F>`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('shift')
    .setDescription('Manage community shifts')

    // /shift create
    .addSubcommand(s => s
      .setName('create')
      .setDescription('Create a new shift')
      .addStringOption(o => o.setName('title').setDescription('Shift title').setRequired(true))
      .addStringOption(o => o.setName('start').setDescription('Start time (e.g. 2024-12-25T10:00:00)').setRequired(true))
      .addStringOption(o => o.setName('end').setDescription('End time (e.g. 2024-12-25T18:00:00)').setRequired(true))
      .addIntegerOption(o => o.setName('quota').setDescription('Max participants (0 = unlimited)'))
      .addStringOption(o => o.setName('description').setDescription('Shift description')))

    // /shift start
    .addSubcommand(s => s
      .setName('start')
      .setDescription('Start (activate) a shift')
      .addStringOption(o => o.setName('id').setDescription('Shift ID').setRequired(true)))

    // /shift pause
    .addSubcommand(s => s
      .setName('pause')
      .setDescription('Pause a shift temporarily')
      .addStringOption(o => o.setName('id').setDescription('Shift ID').setRequired(true)))

    // /shift end
    .addSubcommand(s => s
      .setName('end')
      .setDescription('End and close a shift')
      .addStringOption(o => o.setName('id').setDescription('Shift ID').setRequired(true)))

    // /shift join
    .addSubcommand(s => s
      .setName('join')
      .setDescription('Join an active shift')
      .addStringOption(o => o.setName('id').setDescription('Shift ID').setRequired(true)))

    // /shift leave
    .addSubcommand(s => s
      .setName('leave')
      .setDescription('Leave a shift')
      .addStringOption(o => o.setName('id').setDescription('Shift ID').setRequired(true)))

    // /shift list
    .addSubcommand(s => s
      .setName('list')
      .setDescription('List all shifts'))

    // /shift info
    .addSubcommand(s => s
      .setName('info')
      .setDescription('View detailed info about a shift')
      .addStringOption(o => o.setName('id').setDescription('Shift ID').setRequired(true)))

    // /shift admin
    .addSubcommandGroup(g => g
      .setName('admin')
      .setDescription('Admin shift management')
      .addSubcommand(s => s
        .setName('setquota')
        .setDescription('Set quota for a shift')
        .addStringOption(o => o.setName('id').setDescription('Shift ID').setRequired(true))
        .addIntegerOption(o => o.setName('quota').setDescription('New quota (0 = unlimited)').setRequired(true)))
      .addSubcommand(s => s
        .setName('adjusttime')
        .setDescription('Add or subtract minutes from a shift end time')
        .addStringOption(o => o.setName('id').setDescription('Shift ID').setRequired(true))
        .addIntegerOption(o => o.setName('minutes').setDescription('Minutes to add (negative to subtract)').setRequired(true)))
      .addSubcommand(s => s
        .setName('adjustuser')
        .setDescription('Adjust how long a user has been on shift (in minutes)')
        .addStringOption(o => o.setName('id').setDescription('Shift ID').setRequired(true))
        .addUserOption(o => o.setName('user').setDescription('User to adjust').setRequired(true))
        .addIntegerOption(o => o.setName('minutes').setDescription('Minutes to add or subtract').setRequired(true)))
      .addSubcommand(s => s
        .setName('removeuser')
        .setDescription('Remove a user from a shift')
        .addStringOption(o => o.setName('id').setDescription('Shift ID').setRequired(true))
        .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true)))
      .addSubcommand(s => s
        .setName('reset')
        .setDescription('Reset all shifts in this server')))

    .setDefaultMemberPermissions(0),

  async execute(interaction) {
    const ok = await InteractionHelper.safeDefer(interaction);
    if (!ok) return;

    const sub = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);

    try {
      const cfg = await getGuildConfig(interaction.client, interaction.guildId).catch(() => ({}));
      const shifts = Array.isArray(cfg.shifts) ? cfg.shifts : [];

      const saveShifts = async (newShifts) => {
        await updateGuildConfig(interaction.client, interaction.guildId, { shifts: newShifts });
      };

      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

      // ── ADMIN GROUP ────────────────────────────────────────────
      if (group === 'admin') {
        if (!isAdmin) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('You need **Manage Server** permission to use admin commands.', '❌ Forbidden')],
          });
        }

        if (sub === 'setquota') {
          const id = interaction.options.getString('id', true).trim();
          const quota = interaction.options.getInteger('quota', true);
          const shift = shifts.find(s => s.id === id);
          if (!shift) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(`No shift found with ID \`${id}\`.`)] });

          shift.quota = quota;
          await saveShifts(shifts);
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
              `Quota for shift **${shift.title}** (\`${id}\`) set to **${quota === 0 ? 'Unlimited' : quota}**.`,
              '✅ Quota Updated'
            )],
          });
        }

        if (sub === 'adjusttime') {
          const id = interaction.options.getString('id', true).trim();
          const minutes = interaction.options.getInteger('minutes', true);
          const shift = shifts.find(s => s.id === id);
          if (!shift) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(`No shift found with ID \`${id}\`.`)] });

          const end = new Date(shift.end);
          end.setMinutes(end.getMinutes() + minutes);
          shift.end = end.toISOString();
          await saveShifts(shifts);

          const direction = minutes >= 0 ? `+${minutes}` : `${minutes}`;
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
              `Shift **${shift.title}** (\`${id}\`) end time adjusted by **${direction} minutes**.\nNew end time: ${formatTimestamp(shift.end)}`,
              '✅ Time Adjusted'
            )],
          });
        }

        if (sub === 'adjustuser') {
          const id = interaction.options.getString('id', true).trim();
          const user = interaction.options.getUser('user', true);
          const minutes = interaction.options.getInteger('minutes', true);
          const shift = shifts.find(s => s.id === id);
          if (!shift) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(`No shift found with ID \`${id}\`.`)] });

          const participant = (shift.participants || []).find(p => p.userId === user.id);
          if (!participant) return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(`<@${user.id}> is not a participant of this shift.`)],
          });

          // Adjust their joinedAt timestamp to change their effective duration
          const adjustMs = minutes * 60000;
          participant.joinedAt = new Date(new Date(participant.joinedAt).getTime() - adjustMs).toISOString();
          await saveShifts(shifts);

          const direction = minutes >= 0 ? `+${minutes}` : `${minutes}`;
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
              `Adjusted <@${user.id}>'s shift time by **${direction} minutes** on shift **${shift.title}** (\`${id}\`).`,
              '✅ User Time Adjusted'
            )],
          });
        }

        if (sub === 'removeuser') {
          const id = interaction.options.getString('id', true).trim();
          const user = interaction.options.getUser('user', true);
          const shift = shifts.find(s => s.id === id);
          if (!shift) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(`No shift found with ID \`${id}\`.`)] });

          const before = (shift.participants || []).length;
          shift.participants = (shift.participants || []).filter(p => p.userId !== user.id);
          await saveShifts(shifts);

          if (shift.participants.length === before) {
            return InteractionHelper.safeEditReply(interaction, {
              embeds: [warningEmbed(`<@${user.id}> was not found in shift **${shift.title}**.`)],
            });
          }

          return InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
              `Removed <@${user.id}> from shift **${shift.title}** (\`${id}\`).`,
              '✅ User Removed'
            )],
          });
        }

        if (sub === 'reset') {
          await saveShifts([]);
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('All shifts have been reset.', '✅ Shifts Reset')],
          });
        }
      }

      // ── CREATE ────────────────────────────────────────────────
      if (sub === 'create') {
        const title = interaction.options.getString('title', true).trim();
        const startRaw = interaction.options.getString('start', true).trim();
        const endRaw = interaction.options.getString('end', true).trim();
        const quota = interaction.options.getInteger('quota') ?? 0;
        const description = interaction.options.getString('description') || '';

        const start = parseDateInput(startRaw);
        const end = parseDateInput(endRaw);

        if (!start || !end || end <= start) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Invalid dates. End time must be after start time.')],
          });
        }

        const id = makeId();
        const shift = {
          id,
          title,
          description,
          start: start.toISOString(),
          end: end.toISOString(),
          quota,
          mode: 'pending',
          creatorId: interaction.user.id,
          participants: [],
          createdAt: new Date().toISOString(),
        };

        await saveShifts([shift, ...shifts]);

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({
            title: '📋 Shift Created',
            color: 'info',
            fields: [
              { name: '🆔 Shift ID', value: `\`${id}\``, inline: true },
              { name: '📌 Status', value: '⏳ Pending', inline: true },
              { name: '👤 Created by', value: `<@${interaction.user.id}>`, inline: true },
              { name: '⏰ Start', value: formatTimestamp(shift.start), inline: true },
              { name: '⏰ End', value: formatTimestamp(shift.end), inline: true },
              { name: '👥 Quota', value: quota === 0 ? 'Unlimited' : String(quota), inline: true },
              ...(description ? [{ name: '📝 Description', value: description, inline: false }] : []),
            ],
            footer: { text: `Use /shift start ${id} to activate` },
            timestamp: true,
          })],
        });
      }

      // ── START ─────────────────────────────────────────────────
      if (sub === 'start') {
        const id = interaction.options.getString('id', true).trim();
        const shift = shifts.find(s => s.id === id);
        if (!shift) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(`No shift found with ID \`${id}\`.`)] });

        if (shift.creatorId !== interaction.user.id && !isAdmin) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Only the shift creator or an admin can start this shift.')],
          });
        }
        if (shift.mode === 'ended') {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('This shift has already ended and cannot be restarted.')],
          });
        }

        shift.mode = 'active';
        shift.startedAt = new Date().toISOString();
        await saveShifts(shifts);

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            `Shift **${shift.title}** (\`${id}\`) is now **active**.\nMembers can join with \`/shift join ${id}\`.`,
            '▶️ Shift Started'
          )],
        });
      }

      // ── PAUSE ─────────────────────────────────────────────────
      if (sub === 'pause') {
        const id = interaction.options.getString('id', true).trim();
        const shift = shifts.find(s => s.id === id);
        if (!shift) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(`No shift found with ID \`${id}\`.`)] });

        if (shift.creatorId !== interaction.user.id && !isAdmin) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Only the shift creator or an admin can pause this shift.')],
          });
        }
        if (shift.mode !== 'active') {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [warningEmbed(`Shift **${shift.title}** is not currently active (status: **${shift.mode}**).`)],
          });
        }

        shift.mode = 'paused';
        shift.pausedAt = new Date().toISOString();
        await saveShifts(shifts);

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [warningEmbed(
            `Shift **${shift.title}** (\`${id}\`) has been **paused**.\nUse \`/shift start ${id}\` to resume.`,
            '⏸️ Shift Paused'
          )],
        });
      }

      // ── END ───────────────────────────────────────────────────
      if (sub === 'end') {
        const id = interaction.options.getString('id', true).trim();
        const shift = shifts.find(s => s.id === id);
        if (!shift) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(`No shift found with ID \`${id}\`.`)] });

        if (shift.creatorId !== interaction.user.id && !isAdmin) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Only the shift creator or an admin can end this shift.')],
          });
        }
        if (shift.mode === 'ended') {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [warningEmbed('This shift has already ended.')],
          });
        }

        shift.mode = 'ended';
        shift.endedAt = new Date().toISOString();

        // Calculate duration for each participant
        const now = new Date();
        const participantSummary = (shift.participants || []).map(p => {
          const joined = new Date(p.joinedAt);
          const duration = now - joined;
          return `<@${p.userId}> — ${formatDuration(duration)}`;
        });

        await saveShifts(shifts);

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({
            title: '⏹️ Shift Ended',
            color: 'success',
            fields: [
              { name: '📋 Shift', value: `**${shift.title}** (\`${id}\`)`, inline: false },
              { name: '👥 Participants', value: participantSummary.length ? participantSummary.join('\n') : 'No participants', inline: false },
              { name: '🕐 Ended at', value: formatTimestamp(shift.endedAt), inline: true },
              { name: '👥 Total', value: String(shift.participants?.length ?? 0), inline: true },
            ],
            timestamp: true,
          })],
        });
      }

      // ── JOIN ──────────────────────────────────────────────────
      if (sub === 'join') {
        const id = interaction.options.getString('id', true).trim();
        const shift = shifts.find(s => s.id === id);
        if (!shift) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(`No shift found with ID \`${id}\`.`)] });

        if (shift.mode !== 'active') {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(`This shift is currently **${shift.mode}** and cannot be joined.`)],
          });
        }

        const participants = Array.isArray(shift.participants) ? shift.participants : [];
        const alreadyIn = participants.some(p => p.userId === interaction.user.id);

        if (alreadyIn) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [warningEmbed('You are already in this shift.')],
          });
        }
        if (shift.quota && participants.length >= shift.quota) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('This shift is full (quota reached).')],
          });
        }

        participants.push({ userId: interaction.user.id, joinedAt: new Date().toISOString() });
        shift.participants = participants;
        await saveShifts(shifts);

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            `You have joined shift **${shift.title}** (\`${id}\`).\nParticipants: **${participants.length}**${shift.quota ? `/${shift.quota}` : ''}`,
            '✅ Joined Shift'
          )],
        });
      }

      // ── LEAVE ─────────────────────────────────────────────────
      if (sub === 'leave') {
        const id = interaction.options.getString('id', true).trim();
        const shift = shifts.find(s => s.id === id);
        if (!shift) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(`No shift found with ID \`${id}\`.`)] });

        const before = (shift.participants || []).length;
        shift.participants = (shift.participants || []).filter(p => p.userId !== interaction.user.id);

        if (shift.participants.length === before) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [warningEmbed('You are not in this shift.')],
          });
        }

        await saveShifts(shifts);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`You have left shift **${shift.title}** (\`${id}\`).`, '✅ Left Shift')],
        });
      }

      // ── LIST ──────────────────────────────────────────────────
      if (sub === 'list') {
        if (!shifts.length) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: '📋 Shifts', description: 'No shifts found. Create one with `/shift create`.', color: 'info' })],
          });
        }

        const statusEmoji = { active: '🟢', paused: '🟡', pending: '⏳', ended: '🔴' };
        const fields = shifts.slice(0, 25).map(s => ({
          name: `${statusEmoji[s.mode] ?? '⚪'} ${s.title} — \`${s.id}\``,
          value: `**Status:** ${s.mode} | **Participants:** ${s.participants?.length ?? 0}${s.quota ? `/${s.quota}` : ''} | **Ends:** ${formatTimestamp(s.end)}`,
          inline: false,
        }));

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({
            title: '📋 All Shifts',
            color: 'info',
            fields,
            footer: { text: `${shifts.length} total shift${shifts.length !== 1 ? 's' : ''}` },
            timestamp: true,
          })],
        });
      }

      // ── INFO ──────────────────────────────────────────────────
      if (sub === 'info') {
        const id = interaction.options.getString('id', true).trim();
        const shift = shifts.find(s => s.id === id);
        if (!shift) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(`No shift found with ID \`${id}\`.`)] });

        const now = new Date();
        const statusEmoji = { active: '🟢', paused: '🟡', pending: '⏳', ended: '🔴' };

        const participantList = (shift.participants || []).map(p => {
          const duration = now - new Date(p.joinedAt);
          return `<@${p.userId}> — ${formatDuration(duration)}`;
        }).join('\n') || 'No participants yet';

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({
            title: `📋 ${shift.title}`,
            color: 'info',
            fields: [
              { name: '🆔 ID', value: `\`${shift.id}\``, inline: true },
              { name: '📌 Status', value: `${statusEmoji[shift.mode] ?? '⚪'} ${shift.mode}`, inline: true },
              { name: '👤 Created by', value: `<@${shift.creatorId}>`, inline: true },
              { name: '⏰ Start', value: formatTimestamp(shift.start), inline: true },
              { name: '⏰ End', value: formatTimestamp(shift.end), inline: true },
              { name: '👥 Quota', value: shift.quota === 0 ? 'Unlimited' : String(shift.quota), inline: true },
              { name: `👥 Participants (${shift.participants?.length ?? 0})`, value: participantList, inline: false },
              ...(shift.description ? [{ name: '📝 Description', value: shift.description, inline: false }] : []),
            ],
            timestamp: true,
          })],
        });
      }

    } catch (error) {
      logger.error('Shift command error:', error);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed(error.message || 'An unexpected error occurred.', '❌ Error')],
      });
    }
  },
};