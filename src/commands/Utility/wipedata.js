// 📜 Command file loaded – useful for hot‑reload debugging
console.log('[Command] wipedata.js loaded');

import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { PrismaClient } from '@prisma/client';
import { warningEmbed } from '../../utils/embeds.js';
import { getConfirmationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Single Prisma client instance (re‑used across invocations)
const prisma = new PrismaClient();

export default {
  data: new SlashCommandBuilder()
    .setName('wipedata')
    .setDescription('Delete all your personal data from the bot (irreversible)')
    .setDMPermission(false),

  /**
   * Main command handler – heavily logged to pinpoint failures.
   */
  async execute(interaction) {
    console.log('[wipedata] command invoked by', interaction.user.id);

    // -------------------------------------------------
    // 0️⃣  Guard: ensure we have a guild context
    // -------------------------------------------------
    if (!interaction.guild) {
      console.warn('[wipedata] No guild in interaction');
      return interaction.reply({
        embeds: [{ title: '⚠️ Warning', description: 'This command can only be used inside a server.', color: 0xffb000 }],
        flags: [MessageFlags.Ephemeral],
      });
    }

    // -------------------------------------------------
    // 1️⃣  Immediate acknowledgement – show warning embed
    // -------------------------------------------------
    const warningMessage = `⚠️ **THIS ACTION IS IRREVERSIBLE!** ⚠️\n\n` +
      `This will permanently delete **ALL** your data from this server including:\n` +
      `• 💰 Economy balance (wallet & bank)\n` +
      `• 📊 Levels and XP\n` +
      `• 🎒 Inventory items\n` +
      `• 🛍️ Shop purchases\n` +
      `• 🎂 Birthday information\n` +
      `• 🔢 Counter data\n` +
      `• 📋 All other personal data\n\n` +
      `**This cannot be undone. Are you absolutely sure?**`;

    const embed = warningEmbed(warningMessage, '🗑️ Wipe All Data');
    const confirmButtons = getConfirmationButtons('wipedata');

    await InteractionHelper.safeReply(interaction, {
      embeds: [embed],
      components: [confirmButtons],
      flags: MessageFlags.Ephemeral,
    });

    logger.info('[wipedata] confirmation prompt shown', { userId: interaction.user.id, guildId: interaction.guildId });

    // -------------------------------------------------
    // 2️⃣  Deletion logic – placeholder (actual deletion handled elsewhere)
    // -------------------------------------------------
    console.log('[wipedata] awaiting confirmation via button interaction');
  },
};




