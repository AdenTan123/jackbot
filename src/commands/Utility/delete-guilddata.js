// 📜 Command file loaded – useful for hot‑reload debugging
console.log('[Command] delete-guilddata.js loaded');

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
    .setName('delete-guilddata')
    .setDescription('Purges all stored database files/entries for this server.')
    .setDMPermission(false),

  /**
   * Main command handler – heavily logged to pinpoint failures.
   */
  async execute(interaction) {
    console.log('[delete-guilddata] command invoked by', interaction.user.id);

    // -------------------------------------------------
    // 0️⃣  Guard: ensure we have a guild context
    // -------------------------------------------------
    if (!interaction.guild) {
      console.warn('[delete-guilddata] No guild in interaction');
      return interaction.reply({
        embeds: [{ title: '⚠️ Warning', description: 'This command can only be used inside a server.', color: 0xffb000 }],
        flags: [MessageFlags.Ephemeral],
      });
    }

    // -------------------------------------------------
    // 1️⃣  Immediate acknowledgement – show warning embed
    // -------------------------------------------------
    const warningMessage = `⚠️ **THIS ACTION WILL REMOVE ALL GUILD DATA!** ⚠️\n\n` +
      `This will permanently delete all stored database entries for this server.\n` +
      `Are you sure you want to proceed?`;

    const embed = warningEmbed(warningMessage, '🗑️ Delete Guild Data');
    const confirmButtons = getConfirmationButtons('delete-guilddata');

    await InteractionHelper.safeReply(interaction, {
      embeds: [embed],
      components: [confirmButtons],
      flags: MessageFlags.Ephemeral,
    });

    logger.info('[delete-guilddata] confirmation prompt shown', { userId: interaction.user.id, guildId: interaction.guildId });

    // -------------------------------------------------
    // 2️⃣  Deletion logic – placeholder (actual deletion handled via button interaction)
    // -------------------------------------------------
    console.log('[delete-guilddata] awaiting confirmation via button interaction');
  },
};
