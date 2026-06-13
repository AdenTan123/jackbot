const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
require('dotenv').config(); 

module.exports = {
  // Changing this to 'purge' so it displays correctly in Discord
  data: new SlashCommandBuilder()
    .setName('purgecommands')
    .setDescription('Delete all registered slash commands (owner‑only)'),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    // ---- 1️⃣ Guard – Fixed to look for OWNER_IDS to match your environment ----
    const ownerId = process.env.OWNER_IDS?.trim();
    if (!ownerId) {
      console.error('❌ OWNER_IDS not set in environment variables');
      return interaction.reply({
        content: '❌ Bot mis‑configuration – OWNER_IDS is missing.',
        ephemeral: true,
      });
    }

    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        content: "🚫 You don't have permission to run this command.",
        ephemeral: true,
      });
    }

    // Defer the reply immediately to prevent interaction timeout tokens from expiring
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

    // ---- 4️⃣ Final status update via editReply --------------------
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
      console.log('🔁 Exiting process – letting the supervisor restart the bot.');
      process.exit(0);
    }, 2000); 
  },
};