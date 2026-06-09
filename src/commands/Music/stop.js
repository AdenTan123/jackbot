const { SlashCommandBuilder } = require('discord.js');
const { queues } = require('../../utils/MusicQueue');

module.exports = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop music and clear queue'),
  async execute(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue?.playing) return interaction.reply({ content: '❌ Nothing is playing.', ephemeral: true });
    queue.stop();
    queues.delete(interaction.guildId);
    interaction.reply('⏹️ Stopped and cleared the queue.');
  }
};