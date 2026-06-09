import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Music playback controls (basic)')
    .addSubcommand(s => s.setName('play').setDescription('Queue a track').addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)))
    .addSubcommand(s => s.setName('stop').setDescription('Stop playback and clear queue'))
    .addSubcommand(s => s.setName('admin').setDescription('Open the admin music panel').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)),

  async execute(interaction) {
    const ok = await InteractionHelper.safeDefer(interaction);
    if (!ok) return;

    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;
      const cfg = await getGuildConfig(interaction.client, guildId).catch(() => ({}));
      const music = cfg.music || { queue: [], volume: 100, playing: false };

      if (sub === 'play') {
        const query = interaction.options.getString('query', true).trim();
        music.queue = music.queue || [];
        music.queue.push({ requester: interaction.user.id, query, addedAt: new Date().toISOString() });
        await updateGuildConfig(interaction.client, guildId, { music }).catch(() => {});
        return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Queued', `Added **${query}** to the queue.`)] });
      }

      if (sub === 'stop') {
        music.queue = [];
        music.playing = false;
        await updateGuildConfig(interaction.client, guildId, { music }).catch(() => {});
        return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Stopped', 'Playback stopped and queue cleared.')] });
      }

      if (sub === 'admin') {
        const panel = createEmbed({ title: 'Music Admin Panel', description: `Volume: ${music.volume}%\nQueue length: ${ (music.queue || []).length }` });
        const row = InteractionHelper.buildActionRow(
          InteractionHelper.buildButton('music_admin:play', 'Play', 'Primary'),
          InteractionHelper.buildButton('music_admin:stop', 'Stop', 'Danger'),
          InteractionHelper.buildButton('music_admin:queue', 'Queue', 'Secondary'),
        );

        return await InteractionHelper.safeEditReply(interaction, { embeds: [panel], components: [row] });
      }

      return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Unknown subcommand')] });
    } catch (error) {
      logger.error('Music command error', error);
      return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Command failed', error.message || String(error))] });
    }
  }
};
