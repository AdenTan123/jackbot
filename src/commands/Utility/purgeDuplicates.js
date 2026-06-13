// src/commands/Utility/purgeDuplicates.js
// -------------------------------------------------------------------
// /purge – delete *all* slash‑command registrations (global + per‑guild)
// -------------------------------------------------------------------
// Usage: only the owner (process.env.OWNER_ID) may run this.
// After the purge the bot exits so the process manager restarts it.
//
// This command follows the same shape as the other command modules in
// the project (see other files in src/commands/Utility for reference).
// -------------------------------------------------------------------

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
require('dotenv').config(); // ensures process.env is populated

module.exports = {
  // ---------------------------------------------------------------
  // Command definition – Discord will see the command as /purge
  // ---------------------------------------------------------------
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete all registered slash commands (owner‑only)'),

  // ---------------------------------------------------------------
  // Run – invoked by the interaction handler in the bot’s entry file
  // ---------------------------------------------------------------
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

    // ---- 2️⃣ Delete global commands -------------------------------
    try {
      const client = interaction.client; // the logged‑in Discord client
      // Clear all global commands
      await client.application.commands.set([]);
      console.log('✅ Global commands cleared');
    } catch (err) {
      console.error('❌ Failed to clear global commands', err);
      return interaction.reply({
        content: '❌ Could not clear global commands – check the logs.',
        ephemeral: true,
      });
    }

    // ---- 3️⃣ Delete per‑guild commands -----------------------------
    try {
      const { guilds } = interaction.client;
      // Iterate over every guild the bot is currently cached in
      for (const [, guild] of guilds.cache) {
        // Overwrite the guild’s command list with an empty array
        await guild.commands.set([]);
        console.log(`✅ Cleared commands for guild ${guild.id}`);
      }
    } catch (err) {
      console.error('❌ Failed to clear guild commands', err);
      return interaction.reply({
        content: '❌ Could not clear guild commands – check the logs.',
        ephemeral: true,
      });
    }

    // ---- 4️⃣ Send an *ephemeral* confirmation embed ----------------
    const embed = new EmbedBuilder()
      .setTitle('🧹 Purge Completed')
      .setDescription('All slash commands have been removed. The bot will now restart and re‑register the proper command set.')
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });

    // ---- 5️⃣ Graceful shutdown – let the process manager restart ---
    // Give Discord a moment to deliver the reply before we exit.
    setTimeout(() => {
      console.log('🔁 Exiting process – let the supervisor restart the bot.');
      process.exit(0);
    }, 2000); // 2 s is enough for the reply to be sent
  },
};
