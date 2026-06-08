import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_BASE = process.env.MARIZMA_BASE_URL || 'https://maple-api.marizma.games/v1';

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure Marizma API integration for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('api_key').setDescription('Marizma API key').setRequired(true))
    .addBooleanOption(o => o.setName('use_default_base').setDescription('Use default base URL? (if false, provide base_url)'))
    .addStringOption(o => o.setName('base_url').setDescription('Custom base URL (optional)'))
    .addStringOption(o => o.setName('perm_roles').setDescription('Comma-separated role IDs or mentions allowed to use Marizma commands'))
    .addRoleOption(o => o.setName('perm_role').setDescription('A single role allowed to use Marizma commands (optional)')),

  async execute(interaction) {
    const deferred = await InteractionHelper.safeDefer(interaction);
    if (!deferred) return;

    try {
      const apiKey = interaction.options.getString('api_key', true).trim();
      const useDefault = interaction.options.getBoolean('use_default_base');
      const baseUrl = useDefault === false ? (interaction.options.getString('base_url') || '') : DEFAULT_BASE;
      const rolesRaw = interaction.options.getString('perm_roles');
      const singleRole = interaction.options.getRole('perm_role');

      // parse roles: accept mentions or ids separated by comma/space
      const allowedRoleIds = [];
      if (rolesRaw) {
        const parts = rolesRaw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
        for (const p of parts) {
          const match = p.match(/(\d{17,19})/);
          if (match) allowedRoleIds.push(match[1]);
        }
      }

      if (singleRole && singleRole.id) {
        if (!allowedRoleIds.includes(singleRole.id)) allowedRoleIds.push(singleRole.id);
      }

      // save into guild config under key `marizma`
      const cfg = {
        marizma: {
          apiKey,
          baseUrl: baseUrl || DEFAULT_BASE,
          allowedRoleIds
        }
      };

      await updateGuildConfig(interaction.client, interaction.guild.id, cfg, { userId: interaction.user.id, command: 'setup' });

      const desc = `Saved Marizma configuration. Base URL: ${cfg.marizma.baseUrl}\nAllowed roles: ${allowedRoleIds.length ? allowedRoleIds.join(', ') : 'none (server admins only)'}`;
      await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(desc, 'Marizma Config Saved')] });
    } catch (error) {
      logger.error('Error saving Marizma setup', error);
      await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to save configuration', error)] });
    }
  }
};
