
// ---------------------------------------------------------------
// /refreshcommands – Owner‑only utility that:
//   1️⃣ Deletes every global slash command.
//   2️⃣ Deletes every per‑guild slash command for all cached guilds.
//   3️⃣ Re‑registers the current command set (all commands under src/commands/**).
//   4️⃣ Sends an ephemeral embed reporting the result.
//   5️⃣ Exits the process so a process manager restarts the bot and the new
//      command list becomes active.
// ---------------------------------------------------------------

import {
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
require('dotenv').config(); // loads .env → process.env

// -----------------------------------------------------------------
// 1️⃣ REST client – uses the bot token from .env
// -----------------------------------------------------------------
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// -----------------------------------------------------------------
// 2️⃣ Helper: recursively collect every command file and return the
//    raw JSON payloads that Discord expects.
// -----------------------------------------------------------------
const fs   = require('fs');
const path = require('path');

function walkSync(dir) {
  const results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fp = path.join(dir, file);
    const stat = fs.statSync(fp);
    if (stat && stat.isDirectory()) {
      results.push(...walkSync(fp));
    } else if (file.endsWith('.js')) {
      results.push(fp);
    }
  }
  return results;
}

function loadCommandPayloads() {
  const commandFiles = walkSync(
    path.join(__dirname, '..', '..', 'commands')
  );
  const payloads = [];
  for (const file of commandFiles) {
    // Ensure we get a fresh copy (avoids stale cache)
    delete require.cache[require.resolve(file)];
    const cmd = require(file);
    if (cmd && cmd.data && typeof cmd.data.toJSON === 'function') {
      payloads.push(cmd.data.toJSON());
    }
  }
  return payloads;
}

// -----------------------------------------------------------------
// 3️⃣ Export the slash‑command definition
// -----------------------------------------------------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('refreshcommands')
    .setDescription('Delete all commands (global & guild) and re‑register the current set (owner‑only)'),



  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    // --------------------------------------------------------------
    // 0️⃣ Defer – prevents interaction timeout while we do network I/O
    // --------------------------------------------------------------
    await interaction.deferReply({ ephemeral: true });

    // --------------------------------------------------------------
    // 1️⃣ Owner guard – only the user whose ID is in OWNER_ID may run it
    // --------------------------------------------------------------
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

    // --------------------------------------------------------------
    // 2️⃣ Wipe **global** commands
    // --------------------------------------------------------------
    let globalCleared = false;
    try {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: [] } // empty array removes all global commands
      );
      console.log('✅ All global commands cleared');
      globalCleared = true;
    } catch (err) {
      console.error('❌ Failed to clear global commands', err);
    }

    // --------------------------------------------------------------
    // 3️⃣ Wipe **per‑guild** commands for every cached guild
    // --------------------------------------------------------------
    let guildErrorCount = 0;
    const { guilds } = interaction.client;
    for (const [, guild] of guilds.cache) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id),
          { body: [] }
        );
        console.log(`✅ Cleared commands for guild ${guild.id}`);
      } catch (err) {
        console.error(`❌ Failed to clear guild ${guild.id}`, err);
        guildErrorCount++;
      }
    }

    // --------------------------------------------------------------
    // 4️⃣ Re‑register the **current** command set
    // --------------------------------------------------------------
    const payloads = loadCommandPayloads();
    let registerSuccess = false;
    try {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: payloads }
      );
      console.log(`✅ Re‑registered ${payloads.length} commands`);
      registerSuccess = true;
    } catch (err) {
      console.error('❌ Failed to re‑register commands', err);
    }

    // --------------------------------------------------------------
    // 5️⃣ Build an embed that summarises everything
    // --------------------------------------------------------------
    const embed = new EmbedBuilder()
      .setTitle('🔄 Refresh Commands Completed')
      .setDescription(
        `• Global purge: ${globalCleared ? '✅ Cleared' : '❌ Failed'}\n` +
        `• Guild purge errors: ${guildErrorCount}\n` +
        `• Re‑register: ${registerSuccess ? `✅ ${payloads.length} commands` : '❌ Failed'}`
      )
      .setColor(
        (!globalCleared || guildErrorCount > 0 || !registerSuccess)
          ? 0xffa500   // orange for any failure
          : 0x00ff00   // green when everything succeeded
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // --------------------------------------------------------------
    // 6️⃣ Graceful shutdown – let the supervisor restart the bot
    // --------------------------------------------------------------
    // Give Discord a moment to deliver the embed before we exit.
    setTimeout(() => {
      console.log('🔁 Exiting process – let the supervisor restart the bot.');
      process.exit(0);
    }, 3000); // 3 seconds safety margin
  },
};