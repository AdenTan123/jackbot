// resume.js
const { SlashCommandBuilder } = require('discord.js');
const { queues } = require('../../utils/MusicQueue');
module.exports = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),
  async execute(interaction) {
    queues.get(interaction.guildId)?.resume();
    interaction.reply('▶️ Resumed.');
  }
};