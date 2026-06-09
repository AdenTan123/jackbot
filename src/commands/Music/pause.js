// pause.js
const { SlashCommandBuilder } = require('discord.js');
const { queues } = require('../../utils/MusicQueue');
module.exports = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause the current song'),
  async execute(interaction) {
    queues.get(interaction.guildId)?.pause();
    interaction.reply('⏸️ Paused.');
  }
};