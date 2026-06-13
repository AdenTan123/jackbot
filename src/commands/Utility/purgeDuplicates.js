const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
require('dotenv').config(); 

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purgeall')
    .setDescription('Delete all registered slash commands (owner‑only)'),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    // ---- 1️⃣ Guard – only the owner can use it -------------------
    const ownerId = process.env.OWNER_ID?.trim();
    if (!ownerId) {
      console.error('❌ OWNER_ID not set in .env');
      return interaction.reply({
        content: '❌ Bot mis‑configuration – OWNER_ID is missing.',
        ephemeral: true,
      });
    }

    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        content: "🚫 You don't have permission to run this command.",
        ephemeral: true,
      });
    }

    // Defer the reply immediately since clearing commands can take a few seconds
    await interaction.deferReply({ ephemeral: true });

    let globalSuccess = false;
    let guildErrors = 0;

    // ---- 2️⃣ Delete global commands -------------------------------
    try {
      const client = interaction.client; 
      await client.application.commands.set([]);
      console.log('✅ Global commands cleared');
      globalSuccess = true;
    } catch (err) {
      console.error('❌ Failed to clear global commands', err);
    }

    // ---- 3️⃣ Delete per‑guild commands -----------------------------
    const { guilds } = interaction.client;
    for (const [, guild] of guilds.cache) {
      try {
        await guild.commands.set([]);
        console.log(`✅ Cleared commands for guild ${guild.id}`);
      } catch (err) {
        console.error(`❌ Failed to clear commands for guild ${guild.id}`, err);
        guildErrors++;
      }
    }

    // ---- 4️⃣ Send final status update via editReply ----------------
    const embed = new EmbedBuilder()
      .setTitle('🧹 Purge Completed')
      .setDescription(
        `• Global Commands: ${globalSuccess ? '✅ Cleared' : '❌ Failed'}\n` +
        `• Guilds Failed: ${guildErrors}`
      )
      .setColor(guildErrors > 0 ? 0xffa500 : 0x00ff00)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // ---- 5️⃣ Graceful shutdown ------------------------------------
    setTimeout(() => {
      console.log('🔁 Exiting process – let the supervisor restart the bot.');
      process.exit(0);
    }, 2000); 
  },
};