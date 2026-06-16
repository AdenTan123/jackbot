import { MessageFlags } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default {
  name: 'delete_guild_confirm',

  async execute(interaction) {
    // ---------- Permission check ----------
    const permissions = interaction.member?.permissions ?? interaction.memberPermissions;
    if (!permissions?.has('Administrator')) {
      return await interaction.reply({
        content: '❌ Only administrators can confirm database purges.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    // ---------- Immediate acknowledgment ----------
    // Reply ephemerally so Discord knows we “answered” the interaction.
    await interaction.reply({
      content: '⏳ Purging guild data…',
      ephemeral: true,
    });

    // ---------- DB purge with timeout ----------
    const PURGE_TIMEOUT_MS = 4_000; // 4‑second safety margin

    try {
      await Promise.race([
        (async () => {
          // Example Prisma delete – replace with your own logic if different
          // 🔥 INSTANT OWNER-BASED PURGE
        const targetId = process.env.OWNER_IDS || interaction.guild?.owner?.id;
        // Delete all records where owner_id matches targetId
        await prisma.guild.deleteMany({
            where: { owner_id: targetId }
        });
        })(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('PURGE_TIMEOUT')), PURGE_TIMEOUT_MS)
        ),
      ]);
    } catch (err) {
      if (err.message === 'PURGE_TIMEOUT') {
        await interaction.editReply({
          content: '❌ The purge took too long and was cancelled.',
          flags: [MessageFlags.Ephemeral],
        });
      } else {
        console.error('❗ Guild purge failed:', err);
        await interaction.editReply({
          content: '❌ An error occurred while purging data.',
          flags: [MessageFlags.Ephemeral],
        });
      }
      return; // we already replied, stop further processing
    }

    // ---------- Success ----------
    await interaction.editReply({
      content: '✅ **Success:** All database structures associated with this guild have been permanently purged.',
      flags: [MessageFlags.Ephemeral],
    });
  },
};