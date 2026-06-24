import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('massrole')
    .setDescription('Add or remove a role for multiple users')
    .addStringOption(opt =>
      opt.setName('action')
        .setDescription('Whether to add or remove the role')
        .setRequired(true)
        .addChoices(
          { name: 'Add Role', value: 'add' },
          { name: 'Remove Role', value: 'remove' }
        ))
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('The role to assign or remove')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('users')
        .setDescription('Mention users or provide user IDs separated by spaces')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply();

    const action = interaction.options.getString('action');
    const role = interaction.options.getRole('role');
    const usersInput = interaction.options.getString('users');

    // Extract potential user IDs from inputs (supports mentions like <@123...> and raw IDs)
    const userIds = [...new Set([...usersInput.matchAll(/\d{17,19}/g)].map(m => m[0]))];

    if (!userIds.length) {
      return interaction.editReply('❌ No valid users found. Mention users or provide their IDs.');
    }

    const botMember = interaction.guild.members.me;
    if (role.position >= botMember.roles.highest.position) {
      return interaction.editReply("❌ That role is higher than my highest role. I can't manage it.");
    }

    const results = { success: [], failed: [] };

    for (const userId of userIds) {
      try {
        const member = await interaction.guild.members.fetch(userId);
        
        if (action === 'add') {
          await member.roles.add(role);
        } else {
          await member.roles.remove(role);
        }
        
        results.success.push(`<@${userId}>`);
      } catch (error) {
        results.failed.push(`<@${userId}>`);
      }
    }

    const actionText = action === 'add' ? 'Added' : 'Removed';

    const embed = new EmbedBuilder()
      .setColor(results.failed.length === 0 ? 0x57F287 : 0xFEE75C)
      .setTitle(`Mass Role Action: ${actionText}`)
      .addFields(
        { name: '✅ Success', value: results.success.join(', ') || 'None', inline: false },
        { name: '❌ Failed', value: results.failed.join(', ') || 'None', inline: false },
        { name: 'Role', value: `${role}`, inline: true },
        { name: 'Total Actioned', value: `${results.success.length}/${userIds.length}`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};