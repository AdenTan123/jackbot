import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('commandpermission')
    .setDescription('Configure which roles can use a specific command')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('command').setDescription('Command name (e.g. ping)').setRequired(true))
    .addStringOption(o => o.setName('perm_roles').setDescription('Comma-separated role IDs or mentions allowed'))
    .addRoleOption(o => o.setName('perm_role').setDescription('Single role allowed (optional)'))
    .addBooleanOption(o => o.setName('clear').setDescription('Clear permissions for this command')),

  async execute(interaction) {
    const deferred = await InteractionHelper.safeDefer(interaction);
    if (!deferred) return;

    try {
      const commandName = interaction.options.getString('command', true).trim();
      const rolesRaw = interaction.options.getString('perm_roles');
      const singleRole = interaction.options.getRole('perm_role');
      const clear = interaction.options.getBoolean('clear');

      const guildId = interaction.guild.id;
      const current = await getGuildConfig(interaction.client, guildId) || {};
      const existingPerms = current.commandPermissions || {};

      let allowedRoleIds = Array.isArray(existingPerms[commandName]) ? [...existingPerms[commandName]] : [];

      if (clear) {
        allowedRoleIds = [];
      } else {
        if (rolesRaw) {
          const parts = rolesRaw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
          for (const p of parts) {
            const match = p.match(/(\d{17,19})/);
            if (match) allowedRoleIds.push(match[1]);
          }
        }

        if (singleRole?.id && !allowedRoleIds.includes(singleRole.id)) {
          allowedRoleIds.push(singleRole.id);
        }

        // normalize unique
        allowedRoleIds = Array.from(new Set(allowedRoleIds));
      }

      const newPerms = { ...(existingPerms || {}) };
      if (allowedRoleIds.length === 0) {
        // remove key if empty
        delete newPerms[commandName];
      } else {
        newPerms[commandName] = allowedRoleIds;
      }

      await updateGuildConfig(interaction.client, guildId, { commandPermissions: newPerms }, { userId: interaction.user.id, command: 'commandpermission' });

      const msg = allowedRoleIds.length === 0
        ? `Permissions cleared for \/${commandName}`
        : `Allowed roles for \/${commandName}: ${allowedRoleIds.join(', ')}`;

      await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(msg)] });
    } catch (error) {
      logger.error('Failed to update command permissions', error);
      await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to update command permissions', error)] });
    }
  }
};
