import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('activity')
    .setDescription('Check activity information for a user or role members')
    .addSubcommand(sub =>
      sub.setName('user')
        .setDescription('Check activity for a specific user')
        .addUserOption(o =>
          o.setName('target').setDescription('User to check').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('role')
        .setDescription('Check activity for all members of a role')
        .addRoleOption(o =>
          o.setName('target').setDescription('Role to check').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  category: 'moderation',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn('Activity interaction defer failed', {
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });
      return;
    }

    try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'user') {
        const user = interaction.options.getUser('target');
        const member = interaction.options.getMember('target');

        if (!member) throw new Error('That user is not in this server.');

        const embed = await buildUserActivityEmbed(member, user);
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

      } else if (sub === 'role') {
        const role = interaction.options.getRole('target');
        await interaction.guild.members.fetch();
        const members = role.members;

        if (!members.size) throw new Error('No members found with that role.');

        // Cap at 10 to avoid embed overflow
        const sample = [...members.values()].slice(0, 10);

        const fields = await Promise.all(sample.map(async (m) => {
          const status = getStatus(m);
          const joinedAt = m.joinedAt
            ? `<t:${Math.floor(m.joinedAt.getTime() / 1000)}:R>`
            : 'Unknown';
          return {
            name: `${m.user.tag}`,
            value: `**Status:** ${status}\n**Joined:** ${joinedAt}\n**Top Role:** ${m.roles.highest}`,
            inline: true,
          };
        }));

        const embed = createEmbed({
          title: `📊 Role Activity — ${role.name}`,
          description: `Showing **${sample.length}** of **${members.size}** members with ${role}`,
          color: 'info',
          fields,
          footer: members.size > 10 ? { text: `Showing first 10 of ${members.size} members` } : null,
          timestamp: true,
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

    } catch (error) {
      logger.error('Activity command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'activity_failed' });
    }
  },
};

async function buildUserActivityEmbed(member, user) {
  const joinedAt = member.joinedAt
    ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F> (<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>)`
    : 'Unknown';

  const createdAt = user.createdAt
    ? `<t:${Math.floor(user.createdAt.getTime() / 1000)}:F> (<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>)`
    : 'Unknown';

  const roles = member.roles.cache
    .filter(r => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map(r => `${r}`)
    .slice(0, 10)
    .join(', ') || 'None';

  const topRole = member.roles.highest.id !== member.guild.id
    ? `${member.roles.highest}`
    : 'None';

  const status = getStatus(member);
  const activity = getActivity(member);

  const boostedSince = member.premiumSince
    ? `<t:${Math.floor(member.premiumSince.getTime() / 1000)}:R>`
    : 'Not boosting';

  const flags = user.flags?.toArray() ?? [];
  const badges = flags.length
    ? flags.map(f => formatBadge(f)).filter(Boolean).join(', ')
    : 'None';

  const isBot = user.bot ? '🤖 Yes' : 'No';
  const nickname = member.nickname || 'None';

  const avatarUrl = user.displayAvatarURL({ size: 256 });

  return createEmbed({
    title: `📋 Activity — ${user.tag}`,
    color: 'info',
    thumbnail: avatarUrl,
    fields: [
      {
        name: '👤 Account Info',
        value: `**ID:** \`${user.id}\`\n**Created:** ${createdAt}\n**Bot:** ${isBot}\n**Badges:** ${badges}`,
        inline: false,
      },
      {
        name: '🏠 Server Info',
        value: `**Joined:** ${joinedAt}\n**Nickname:** ${nickname}\n**Boosting Since:** ${boostedSince}`,
        inline: false,
      },
      {
        name: '🎮 Current Activity',
        value: `**Status:** ${status}\n**Activity:** ${activity}`,
        inline: false,
      },
      {
        name: `🎭 Roles (${member.roles.cache.size - 1})`,
        value: roles,
        inline: false,
      },
      {
        name: '⭐ Top Role',
        value: topRole,
        inline: true,
      },
      {
        name: '🔑 Key Permissions',
        value: getKeyPermissions(member),
        inline: true,
      },
    ],
    footer: { text: `JackBot` },
    timestamp: true,
  });
}

function getStatus(member) {
  const statusMap = {
    online: '🟢 Online',
    idle: '🌙 Idle',
    dnd: '⛔ Do Not Disturb',
    offline: '⚫ Offline',
  };
  return statusMap[member.presence?.status] ?? '⚫ Offline';
}

function getActivity(member) {
  const activity = member.presence?.activities?.[0];
  if (!activity) return 'None';
  const typeMap = { 0: '🎮 Playing', 1: '📺 Streaming', 2: '🎵 Listening to', 3: '👀 Watching', 5: '🏆 Competing in' };
  const type = typeMap[activity.type] ?? 'Doing';
  return `${type} **${activity.name}**`;
}

function getKeyPermissions(member) {
  const perms = [
    ['Administrator', '👑 Admin'],
    ['ManageGuild', '⚙️ Manage Server'],
    ['ManageRoles', '🎭 Manage Roles'],
    ['ManageChannels', '📁 Manage Channels'],
    ['ManageMessages', '🗑️ Manage Messages'],
    ['BanMembers', '🔨 Ban Members'],
    ['KickMembers', '👢 Kick Members'],
    ['MentionEveryone', '📢 Mention Everyone'],
  ];
  const has = perms.filter(([perm]) => member.permissions.has(perm)).map(([, label]) => label);
  return has.length ? has.join('\n') : 'No key permissions';
}

function formatBadge(flag) {
  const badges = {
    Staff: '👨‍💼 Discord Staff',
    Partner: '🤝 Partner',
    Hypesquad: '🏠 HypeSquad Events',
    BugHunterLevel1: '🐛 Bug Hunter',
    BugHunterLevel2: '🐛 Gold Bug Hunter',
    HypeSquadOnlineHouse1: '⚡ Bravery',
    HypeSquadOnlineHouse2: '💡 Brilliance',
    HypeSquadOnlineHouse3: '⚖️ Balance',
    PremiumEarlySupporter: '🌟 Early Supporter',
    VerifiedBot: '✅ Verified Bot',
    VerifiedDeveloper: '🔧 Verified Developer',
    ActiveDeveloper: '🛠️ Active Developer',
  };
  return badges[flag] ?? null;
}