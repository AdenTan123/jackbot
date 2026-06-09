import { InteractionHelper } from '../../utils/interactionHelper.js';
import { updateGuildConfig } from '../../services/guildConfig.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export default {
  name: 'marizma_setup_modal',
  async execute(interaction) {
    try {
      const ready = await InteractionHelper.ensureReady(interaction, { flags: 1 << 6 });
      if (!ready) return;

      // permission: ManageGuild or server role configured previously
      const member = interaction.member;
      if (!member.permissions.has('ManageGuild')) {
        // allow if user has any role in existing allowedRoleIds
        const cfg = await import('../../services/guildConfig.js').then(m => m.getGuildConfig(interaction.client, interaction.guildId).catch(() => ({})));
        const allowed = (cfg && cfg.marizma && Array.isArray(cfg.marizma.allowedRoleIds)) ? cfg.marizma.allowedRoleIds : [];
        const hasRole = allowed.some(r => member.roles.cache.has(r));
        if (!hasRole) {
          await InteractionHelper.safeReply(interaction, { content: 'You do not have permission to configure Marizma for this server.', flags: 1 << 6 });
          return;
        }
      }

      const apiKey = interaction.fields.getTextInputValue('marizma_api_key')?.trim();
      const baseUrl = interaction.fields.getTextInputValue('marizma_base_url')?.trim();
      const rolesRaw = interaction.fields.getTextInputValue('marizma_allowed_roles')?.trim();

      // Temporary debug: log submission metadata but never log full API key
      try {
        const masked = apiKey ? (String(apiKey).length > 6 ? `${String(apiKey).slice(0,3)}...${String(apiKey).slice(-3)}` : '***') : null;
        logger.info('marizma_setup_modal submitted', { guildId: interaction.guildId, userId: interaction.user.id, apiKeyMasked: masked, baseUrl: baseUrl || null, rolesProvided: Boolean(rolesRaw) });
      } catch (logErr) {
        // ignore logging errors
      }

      if (!apiKey) {
        await InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Invalid', 'API key cannot be empty.')], flags: 1 << 6 });
        return;
      }

      const allowedRoleIds = [];
      if (rolesRaw) {
        const parts = rolesRaw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
        for (const p of parts) {
          const m = p.match(/(\d{17,19})/);
          if (m) allowedRoleIds.push(m[1]);
        }
      }

      const cfg = {
        marizma: {
          apiKey,
          baseUrl: baseUrl || undefined,
          allowedRoleIds
        }
      };

      await updateGuildConfig(interaction.client, interaction.guildId, cfg, { userId: interaction.user.id, command: 'setupmodal' });

      try {
        const masked = apiKey ? (String(apiKey).length > 6 ? `${String(apiKey).slice(0,3)}...${String(apiKey).slice(-3)}` : '***') : null;
        logger.info('Saved Marizma configuration for guild', { guildId: interaction.guildId, userId: interaction.user.id, apiKeyMasked: masked, baseUrl: cfg.marizma.baseUrl, allowedRoleIds: cfg.marizma.allowedRoleIds.length });
      } catch (logErr) {}

      await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Marizma configured for this server.')], flags: 1 << 6 });
    } catch (error) {
      logger.error('Error handling marizma_setup_modal submission:', error);
      try {
        await InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Failed', 'Could not save configuration.')], flags: 1 << 6 });
      } catch (e) {
        logger.error('Failed to send error reply for marizma_setup_modal:', e);
      }
    }
  }
};
