const { SlashCommandBuilder } = require('discord.js');
const { queues } = require('../../utils/MusicQueue');

module.exports = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current song'),
  async execute(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue?.playing) return interaction.reply({ content: '❌ Nothing is playing.', ephemeral: true });
    queue.skip();
    interaction.reply('⏭️ Skipped!');
  }
};