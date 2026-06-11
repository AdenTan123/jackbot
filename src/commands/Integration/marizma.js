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
    .addSubcommand(s => s.setName('setbanner').setDescription('Set a server banner').addStringOption(o => o.setName('banner').setDescription('Banner text').setRequired(true)))
    .addSubcommand(s => s.setName('startup').setDescription('Mark server as started and broadcast startup message').addUserOption(o => o.setName('cohost').setDescription('Co-host user').setRequired(false)).addUserOption(o => o.setName('host').setDescription('Host user').setRequired(false))),

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

      // Temporary debug logging: record invocation context but never log full API keys
      try {
        const masked = overrides.apiKey ? (String(overrides.apiKey).length > 6 ? `${String(overrides.apiKey).slice(0,3)}...${String(overrides.apiKey).slice(-3)}` : '***') : null;
        logger.debug('Marizma command invoked', { sub, guildId: interaction.guildId, userId: interaction.user.id, overrides: { apiKey: masked, baseUrl: overrides.baseUrl } });
      } catch (logErr) {
        // swallow logging errors
      }

      // require either environment key or guild-specific key
      if (!process.env.MARIZMA_API_KEY && !overrides.apiKey) {
        return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Marizma API key not configured. Set MARIZMA_API_KEY in environment or run /setup to configure for this server.') ] });
      }

      switch (sub) {
        case 'server': {
          const res = await api.getServer(overrides);
          logger.debug('Marizma.getServer response', { guildId: interaction.guildId, success: Boolean(res && res.success), error: res?.error });
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to fetch server info', res?.error || null)] });
          const d = res.data || {};
          const embed = createEmbed({ title: `Server: ${d.ServerName || 'Unknown'}`, description: d.ServerDescription || 'No description', fields: [ { name: 'Players', value: String(d.PlayerCount || 0), inline: true }, { name: 'Max Players', value: String(d.MaxPlayers || 0), inline: true } ] });
          return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
        case 'players': {
          const res = await api.getPlayers(overrides);
          logger.debug('Marizma.getPlayers response', { guildId: interaction.guildId, count: res?.data?.Players?.length || 0, success: Boolean(res && res.success), error: res?.error });
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to fetch players', res?.error || null)] });
          const players = (res.data?.Players || []).slice(0, 50).map(p => `${p.Name || p}`);
          const embed = createEmbed({ title: `Players (${players.length})`, description: players.length ? players.join('\n') : 'No players' });
          return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
        case 'queue': {
          const res = await api.getQueue(overrides);
          logger.debug('Marizma.getQueue response', { guildId: interaction.guildId, queueSize: res?.data?.Queue?.length || 0, success: Boolean(res && res.success), error: res?.error });
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to fetch queue', res?.error || null)] });
          const q = (res.data?.Queue || []).map(String);
          return await InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: `Queue (${q.length})`, description: q.length ? q.join('\n') : 'No queue' })] });
        }
        case 'bans': {
          const res = await api.getBans(overrides);
          logger.debug('Marizma.getBans response', { guildId: interaction.guildId, bans: res?.data?.Bans?.length || 0, success: Boolean(res && res.success), error: res?.error });
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to fetch bans', res?.error || null)] });
          const bans = (res.data?.Bans || []).map(String);
          return await InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: `Bans (${bans.length})`, description: bans.length ? bans.join('\n') : 'No bans' })] });
        }
        case 'announce': {
          const message = interaction.options.getString('message', true);
          const res = await api.announce(message, overrides);
          logger.debug('Marizma.announce response', { guildId: interaction.guildId, success: Boolean(res && res.success), error: res?.error });
          if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Announce failed', res?.error || null)] });
          return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Announcement sent')] });
        }
          case 'shutdown': {
            const bannerText = `⚠️ SSD || The server is now shutting down. Thank you for playing.`;

            // attempt to set banner and hide from list before shutdown
            try {
              const bres = await api.setBanner(bannerText, overrides);
              logger.debug('Marizma.setBanner response (shutdown)', { guildId: interaction.guildId, success: Boolean(bres && bres.success), error: bres?.error });
              // ignore bres success check - best effort
            } catch (e) {
              logger.warn('Failed to set banner before shutdown:', e?.message || e);
            }

            try {
              const sres = await api.setSetting({ HideFromList: true }, overrides);
              logger.debug('Marizma.setSetting response (shutdown)', { guildId: interaction.guildId, success: Boolean(sres && sres.success), error: sres?.error });
            } catch (e) {
              logger.warn('Failed to set HideFromList before shutdown:', e?.message || e);
            }

            // purge messages in the startup announcement channel and post WBM info embed
            const purgeChannelId = '1507406822288654467';
            try {
              const ch = await interaction.client.channels.fetch(purgeChannelId).catch(() => null);
              if (ch && ch.isTextBased && ch.messages) {
                // bulk delete in batches (Discord API prevents removing messages older than 14 days)
                let fetched;
                do {
                  fetched = await ch.messages.fetch({ limit: 100 }).catch(() => null);
                  if (!fetched || fetched.size === 0) break;
                  const deletable = fetched.filter(m => (Date.now() - m.createdTimestamp) < 14 * 24 * 60 * 60 * 1000);
                  if (deletable.size > 0) {
                    await ch.bulkDelete(deletable, true).catch(err => logger.warn('bulkDelete partial failure:', err?.message || err));
                  } else {
                    break;
                  }
                } while (fetched && fetched.size > 0);

                const wbmEmbed = createEmbed({ title: '‧₊˚ ┊WBM SESSIONS┊˚₊‧', description: `⏔⏔⏔⏔⏔⏔ ꒰ ﹕ ꒱ ⏔⏔⏔⏔⏔⏔⏔⏔\n\nWelcome to Willowbrook Memorial! We are delighted to see you join our immersive roleplay community. Take part in roleplay with us with your favourite role, either be a nurse, paramedic, a doctor, surgeon or even just a patient, you can do it all here in Willowbrook!\n\nPlease note our server is currently closed, if you had our sessions ping, you will get pinged if we have any sessions! Thank you!\n⏔⏔⏔⏔⏔⏔ ꒰ ﹕ ꒱ ⏔⏔⏔⏔⏔⏔⏔⏔` });
                await ch.send({ embeds: [wbmEmbed] }).catch(err => logger.warn('Failed to send WBM embed after purge:', err?.message || err));
              }
            } catch (e) {
              logger.warn('Could not purge/send WBM embed in channel:', e?.message || e);
            }

            const res = await api.shutdown(overrides);
            logger.debug('Marizma.shutdown response', { guildId: interaction.guildId, success: Boolean(res && res.success), error: res?.error });
            if (!res || !res.success) return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Shutdown failed', res?.error || null)] });
            return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Server shutdown initiated (30s)')] });
          }
        case 'startup': {
  // perform setsetting hidefromlist:False
  try {
    const sres = await api.setSetting({ HideFromList: false }, overrides);
    logger.debug('Marizma.setSetting response (startup)', { guildId: interaction.guildId, success: Boolean(sres && sres.success), error: sres?.error });
  } catch (e) {
    logger.warn('Failed to set HideFromList on startup:', e?.message || e);
  }

  // get optional cohost and host
  const cohostUser = interaction.options.getUser('cohost'); // may be null
  const hostUser = interaction.options.getUser('host') || interaction.user;

  // attempt to set a welcoming banner
  try {
    const bannerText = `✙ Welcome to WBM! Rp Will Start At 15 players, Do !mod, Or !help, For Assistance, This Session Is Being Hosted By ${hostUser.username}, Thank You Lovely Rp!  ✙`;
    const bres = await api.setBanner(bannerText, overrides);
    logger.debug('Marizma.setBanner response (startup)', { guildId: interaction.guildId, success: Boolean(bres && bres.success), error: bres?.error });
  } catch (e) {
    logger.warn('Failed to set banner on startup:', e?.message || e);
  }

  // reply to the command with embed + link
  const joinLink = 'https://www.roblox.com/games/start?placeId=8704997000&launchData=%7B%22serverCode%22%3A%22f99%2D57a%22%7D';
  const embed = createEmbed({ title: 'Successfully Started Up Server', description: `Join Server with this link: ${joinLink}` });
  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

  // post announcement in target channel
  const announceChannelId = '1507406822288654467';
  try {
    const channel = await interaction.client.channels.fetch(announceChannelId).catch(() => null);
    if (channel && channel.isTextBased && channel.messages) {
      // purge previous session messages
      try {
        let fetched;
        do {
          fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
          if (!fetched || fetched.size === 0) break;
          const deletable = fetched.filter(m => (Date.now() - m.createdTimestamp) < 14 * 24 * 60 * 60 * 1000);
          if (deletable.size > 0) {
            await channel.bulkDelete(deletable, true).catch(err => logger.warn('bulkDelete partial failure (startup):', err?.message || err));
          } else {
            break;
          }
        } while (fetched && fetched.size > 0);
      } catch (purgeErr) {
        logger.warn('Failed purging announce channel on startup:', purgeErr?.message || purgeErr);
      }

      // Build co-host mention safely
      const cohostMention = cohostUser ? `<@${cohostUser.id}>` : 'None';

      const announcement = `# Server Start Up !\n\n-# || <@&1508375495732101250> ||\n\nGreetings, Willowbrook Memorial Is Hosting An SSU !\n\nOur Host: <@${hostUser.id}>\n\nCohost: ${cohostMention}\n\nIf you have seen this, dont forget to react with the following:\n\n<:GreenYellowNeonHeart:1511630059113549974> - Available, Coming in 5-10 minutes\n\n<:YellowNeonHeart:1511630192257536181> - Currently Unavailable, Might join in 15-30 minutes\n\n<:OrangeNeonHeart:1511629580841259088> - Unavailable, Cannot join\n\nMake sure to join us! \nCode: f99-57a \nOr click this link: ${joinLink}\n\nthank you.`;
      await channel.send({ content: announcement }).catch(err => logger.warn('Failed to send startup announcement:', err?.message || err));
    }
  } catch (e) {
    logger.warn('Could not post startup announcement:', e?.message || e);
  }

  return;
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
