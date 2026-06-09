import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, errorEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';
import * as api from '../../services/marizmaApi.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('marizma')
    .setDescription('Interact with the Marizma Maple API')
    .addSubcommand(s => s.setName('server').setDescription('Get public server information'))
    .addSubcommand(s => s.setName('players').setDescription('List current players'))
    .addSubcommand(s => s.setName('queue').setDescription('Get server queue'))
    .addSubcommand(s => s.setName('bans').setDescription('Get server bans'))
    .addSubcommand(s => s.setName('announce').setDescription('Announce a message to the server').addStringOption(o => o.setName('message').setDescription('Message to announce').setRequired(true)))
    .addSubcommand(s => s.setName('shutdown').setDescription('Shutdown the server (30s timeout)'))
    .addSubcommand(s => s.setName('setsetting').setDescription('Update server setting').addBooleanOption(o => o.setName('hidefromlist').setDescription('Hide from server list')).addBooleanOption(o => o.setName('private').setDescription('Friends only')).addIntegerOption(o => o.setName('minlevel').setDescription('Minimum level')))
    .addSubcommand(s => s.setName('banplayer').setDescription('Ban or unban a user').addIntegerOption(o => o.setName('userid').setDescription('UserId to ban/unban').setRequired(true)).addBooleanOption(o => o.setName('banned').setDescription('Ban (true) or unban (false)').setRequired(true)))
    .addSubcommand(s => s.setName('kick').setDescription('Kick a player by UserId').addIntegerOption(o => o.setName('userid').setDescription('UserId to kick').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Optional reason')))
    .addSubcommand(s => s.setName('setbanner').setDescription('Set a server banner').addStringOption(o => o.setName('banner').setDescription('Banner text').setRequired(true))),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const sub = interaction.options.getSubcommand();

      const guildCfg = await getGuildConfig(interaction.client, interaction.guildId).catch(() => ({}));
      const overrides = {};
      if (guildCfg && guildCfg.marizma) {
        if (guildCfg.marizma.apiKey) overrides.apiKey = guildCfg.marizma.apiKey;
        if (guildCfg.marizma.baseUrl) overrides.baseUrl = guildCfg.marizma.baseUrl;
      }

      // require either environment key or guild-specific key
      if (!process.env.MARIZMA_API_KEY && !overrides.apiKey) {
        return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Marizma API key not configured. Set MARIZMA_API_KEY in environment or run /setup to configure for this server.') ] });
      }

      switch (sub) {
        case 'server': {
          const res = await api.getServer(overrides);
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to fetch server info', res?.error || null)] });
          const d = res.data || {};
          const embed = createEmbed({ title: `Server: ${d.ServerName || 'Unknown'}`, description: d.ServerDescription || 'No description', fields: [ { name: 'Players', value: String(d.PlayerCount || 0), inline: true }, { name: 'Max Players', value: String(d.MaxPlayers || 0), inline: true } ] });
          return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
        case 'players': {
          const res = await api.getPlayers(overrides);
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to fetch players', res?.error || null)] });
          const players = (res.data?.Players || []).slice(0, 50).map(p => `${p.Name || p}`);
          const embed = createEmbed({ title: `Players (${players.length})`, description: players.length ? players.join('\n') : 'No players' });
          return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
        case 'queue': {
          const res = await api.getQueue(overrides);
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to fetch queue', res?.error || null)] });
          const q = (res.data?.Queue || []).map(String);
          return await InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: `Queue (${q.length})`, description: q.length ? q.join('\n') : 'No queue' })] });
        }
        case 'bans': {
          const res = await api.getBans(overrides);
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to fetch bans', res?.error || null)] });
          const bans = (res.data?.Bans || []).map(String);
          return await InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: `Bans (${bans.length})`, description: bans.length ? bans.join('\n') : 'No bans' })] });
        }
        case 'announce': {
          const message = interaction.options.getString('message', true);
          const res = await api.announce(message, overrides);
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Announce failed', res?.error || null)] });
          return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Announcement sent')] });
        }
        case 'shutdown': {
          const res = await api.shutdown(overrides);
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Shutdown failed', res?.error || null)] });
          return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Server shutdown initiated (30s)')] });
        }
        case 'setsetting': {
          const HideFromList = interaction.options.getBoolean('hidefromlist');
          const Private = interaction.options.getBoolean('private');
          const minLevel = interaction.options.getInteger('minlevel');
          const payload = {};
          if (HideFromList !== null) payload.HideFromList = HideFromList;
          if (Private !== null) payload.Private = Private;
          if (typeof minLevel === 'number') payload.minLevel = minLevel;
          const res = await api.setSetting(payload, overrides);
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to update setting', res?.error || null)] });
          return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Server setting updated')] });
        }
        case 'banplayer': {
          const userId = interaction.options.getInteger('userid', true);
          const banned = interaction.options.getBoolean('banned', true);
          const res = await api.banPlayer(userId, banned, overrides);
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Ban/unban failed', res?.error || null)] });
          return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(`User ${userId} ${banned ? 'banned' : 'unbanned'}`)] });
        }
        case 'kick': {
          const userId = interaction.options.getInteger('userid', true);
          const reason = interaction.options.getString('reason', false) || '';
          const res = await api.kickPlayer(userId, reason, overrides);
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Kick failed', res?.error || null)] });
          return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(`User ${userId} kicked`)] });
        }
        case 'setbanner': {
          const banner = interaction.options.getString('banner', true);
          const res = await api.setBanner(banner, overrides);
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Set banner failed', res?.error || null)] });
          return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Banner set successfully')] });
        }
        default:
          return await InteractionHelper.safeEditReply(interaction, { embeds: [infoEmbed('Unknown subcommand')] });
      }
    } catch (error) {
      logger.error('Marizma command error', error);
      await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Command failed', error)] });
    }
  }
};
