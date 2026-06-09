import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';
import MusicService from '../../services/musicService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Music playback controls (basic)')
    .addSubcommand(s => s.setName('play').setDescription('Queue a track').addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)))
    .addSubcommand(s => s.setName('stop').setDescription('Stop playback and clear queue'))
    .addSubcommand(s => s.setName('admin').setDescription('Open the admin music panel')),

  async execute(interaction) {
    const ok = await InteractionHelper.safeDefer(interaction);
    if (!ok) return;

    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      // Fix #2: Don't silently swallow config errors — fail loudly
      const cfg = await getGuildConfig(interaction.client, guildId).catch(() => null);
      if (!cfg) {
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('Config Unavailable', 'Could not load server config. Please try again.')]
        });
      }

      const music = cfg.music || { queue: [], volume: 100, playing: false };

      if (sub === 'play') {
        const query = interaction.options.getString('query', true).trim();
        music.queue = music.queue || [];
        music.queue.push({ requester: interaction.user.id, query, addedAt: new Date().toISOString() });
        await updateGuildConfig(interaction.client, guildId, { music }).catch(() => {});

        // Try to join immediately but start playback in the background so we don't block the interaction
        try {
          const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
          if (guild) {
            await MusicService.ensureConnection(guild, interaction.member).catch(() => null);
            MusicService.playNext(guild, interaction.client)
              .then(started => {
                if (started) {
                  InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Playing', `Now playing: ${started.query}`)] });
                }
              })
              .catch(e => {
                logger.debug('Background playNext failed', e?.message || e);
              });
          }
        } catch (e) {
          logger.debug('Music start attempt failed', e?.message || e);
        }

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Queued', `Added **${query}** to the queue.`)]
        });
      }

      if (sub === 'stop') {
        music.queue = [];
        music.playing = false;
        await updateGuildConfig(interaction.client, guildId, { music }).catch(() => {});
        try { MusicService.stop(guildId); } catch (e) {}
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Stopped', 'Playback stopped and queue cleared.')]
        });
      }

      if (sub === 'admin') {
        // Fix #1: setDefaultMemberPermissions doesn't work on subcommands — check permissions manually
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Missing Permissions', 'You need **Manage Guild** to use this.')]
          });
        }

        const panel = createEmbed({
          title: 'Music Admin Panel',
          description: `Volume: ${music.volume}%\nQueue length: ${(music.queue || []).length}`
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('music_admin:play').setLabel('Play').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('music_admin:stop').setLabel('Stop').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('music_admin:queue').setLabel('Queue').setStyle(ButtonStyle.Secondary)
        );

        return await InteractionHelper.safeEditReply(interaction, { embeds: [panel], components: [row] });
      }

      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed('Unknown subcommand')]
      });
    } catch (error) {
      logger.error('Music command error', error);
      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed('Command failed', error.message || String(error))]
      });
    }
  }
};