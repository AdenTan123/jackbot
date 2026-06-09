const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { queues } = require('../../utils/MusicQueue');

module.exports = {
  data: new SlashCommandBuilder().setName('queue').setDescription('Show the current queue'),
  async execute(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue?.queue.length) return interaction.reply({ content: '📭 Queue is empty.', ephemeral: true });

    const list = queue.queue.map((t, i) => `${i === 0 ? '🎵' : `${i}.`} **${t.title}** — ${t.requestedBy}`).join('\n');
    interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📋 Queue').setDescription(list)] });
  }
};