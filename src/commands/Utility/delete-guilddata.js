import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default {
  data: new SlashCommandBuilder()
    .setName('delete-guilddata')
    .setDescription('Purges all stored database files/entries for this server.')
    .setDMPermission(false),

  async execute(interaction) {
    // ---------- Permission check ----------
    const permissions = interaction.member?.permissions ?? interaction.memberPermissions;
    if (!permissions?.has('Administrator')) {
      return interaction.reply({
        embeds: [{
          title: '❌ Error',
          description: 'You need administrator permissions to use this command.',
          color: 0xff0000,
        }],
        flags: [MessageFlags.Ephemeral],
      });
    }

    // ---------- Immediate response ----------
    await interaction.reply({
      content: '⏳ Purging guild data…',
      flags: [MessageFlags.Ephemeral],
    });

    // ---------- Owner‑based instant purge ----------
    const targetId = process.env.OWNER_IDS || interaction.guild?.owner?.id;
    try {
      await prisma.guild.deleteMany({
        where: { owner_id: targetId },
      });
      // ---------- Success embed ----------
      await interaction.editReply({
        embeds: [{
          title: '✅ Success',
          description: 'Deleted Guild Data successfully.',
          color: 0x00ff00,
        }],
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      console.error('❗ Guild purge failed:', err);
      // ---------- Error embed ----------
      await interaction.editReply({
        embeds: [{
          title: '❌ Error',
          description: 'Failed to delete Guild Data.',
          color: 0xff0000,
        }],
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};