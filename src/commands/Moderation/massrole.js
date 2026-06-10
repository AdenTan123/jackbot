import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('massrole')
    .setDescription('Add a role to multiple users')
    .addStringOption(opt =>
      opt.setName('users')
        .setDescription('Mention users or provide user IDs separated by spaces')
        .setRequired(true))
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('Role to assign')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply();

    const role = interaction.options.getRole('role');
    const usersInput = interaction.options.getString('users');

    const userIds = [...usersInput.matchAll(/\d{17,19}/g)].map(m => m[0]);

    if (!userIds.length) {
      return interaction.editReply('❌ No valid users found. Mention users or provide their IDs.');
    }

    const botMember = interaction.guild.members.me;
    if (role.position >= botMember.roles.highest.position) {
      return interaction.editReply('❌ That role is higher than my highest role. I can\'t assign it.');
    }

    const results = { success: [], failed: [] };

    for (const userId of userIds) {
      try {
        const member = await interaction.guild.members.fetch(userId);
        await member.roles.add(role);
        results.success.push(`<@${userId}>`);
      } catch {
        results.failed.push(`<@${userId}>`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(results.failed.length === 0 ? 0x57F287 : 0xFEE75C)
      .setTitle('Mass Role Assignment')
      .addFields(
        { name: '✅ Success', value: results.success.join(', ') || 'None', inline: false },
        { name: '❌ Failed', value: results.failed.join(', ') || 'None', inline: false },
        { name: 'Role', value: `${role}`, inline: true },
        { name: 'Total', value: `${results.success.length}/${userIds.length}`, inline: true }
      )
      .setTimestamp();

    interaction.editReply({ embeds: [embed] });
  }
};