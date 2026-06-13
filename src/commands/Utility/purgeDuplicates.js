// src/deletecommand.js
// ---------------------------------------------------------------
// /purgecommands – Owner‑only command that deletes the two
// hard‑coded slash‑command IDs listed below and then restarts the bot.
// ---------------------------------------------------------------

const { REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
require('dotenv').config();               

// -----------------------------------------------------------------
// 1️⃣  REST client – token comes from the .env file
// -----------------------------------------------------------------
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// -----------------------------------------------------------------
// 2️⃣  Command IDs we want to delete (replace with your own IDs)
// -----------------------------------------------------------------
const COMMAND_IDS = [
  '1515184039223361602', // ← first command to purge
  '1515184040012021948', // ← second command to purge
];

module.exports = {
  // -----------------------------------------------------------------
  // Slash‑command definition
  // -----------------------------------------------------------------
  data: new SlashCommandBuilder()
    .setName('purgecommands')
    .setDescription('Delete specific registered slash commands (owner‑only)'),

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    // -----------------------------------------------------------------
    // 0️⃣  Defer – gives us time to finish the deletions before replying
    // -----------------------------------------------------------------
    await interaction.deferReply({ ephemeral: true });

    // -----------------------------------------------------------------
    // 1️⃣  Owner guard – make sure only the configured owner can run it
    // -----------------------------------------------------------------
    const ownerId = process.env.OWNER_ID?.trim();
    if (!ownerId) {
      console.error('❌ OWNER_ID not set in .env');
      return interaction.editReply({
        content: '❌ Bot mis‑configuration – OWNER_ID is missing.',
      });
    }

    if (interaction.user.id !== ownerId) {
      return interaction.editReply({
        content: "🚫 You don't have permission to run this command.",
      });
    }

    // -----------------------------------------------------------------
    // 2️⃣  Delete each command ID, tracking success / failure
    // -----------------------------------------------------------------
    const results = [];
    for (const id of COMMAND_IDS) {
      try {
        await rest.delete(
          Routes.applicationCommand(process.env.CLIENT_ID, id)
        );
        console.log(`✅ Deleted command ${id}`);
        results.push({ id, ok: true });
      } catch (err) {
        console.error(`❌ Failed to delete command ${id}`, err);
        results.push({ id, ok: false, error: err.message });
      }
    }

    // -----------------------------------------------------------------
    // 3️⃣  Build an embed that summarises the outcome
    // -----------------------------------------------------------------
    const embed = new EmbedBuilder()
      .setTitle('🗑️ Purge Commands Completed')
      .setDescription(
        results
          .map(r =>
            r.ok
              ? `✅ \`${r.id}\` – deleted`
              : `❌ \`${r.id}\` – ${r.error || 'failed'}`
          )
          .join('\n')
      )
      .setColor(results.some(r => !r.ok) ? 0xffa500 : 0x00ff00) // orange if any error
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // -----------------------------------------------------------------
    // 4️⃣  Graceful shutdown – let the supervisor restart the bot
    // -----------------------------------------------------------------
    // Give Discord a moment to deliver the edit before we exit.
    setTimeout(() => {
      console.log('🔁 Exiting process – let the supervisor restart the bot.');
      process.exit(0);
    }, 3000); // 3 seconds safety margin
  },
};

