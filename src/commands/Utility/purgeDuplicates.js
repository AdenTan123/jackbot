import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { EMOJIS } from '../../config/emojis.js';

export default {
  data: new SlashCommandBuilder()
    .setName('purgeduplicates')
    .setDescription('Wipe redundant command schemas from the server dashboard register.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply({ flags: ['Ephemeral'] });

    try {
      const guildCommands = await interaction.guild.commands.fetch();
      const uniqueNames = new Set();
      let purgedCount = 0;

      for (const [id, cmd] of guildCommands) {
        if (uniqueNames.has(cmd.name)) {
          await interaction.guild.commands.delete(id);
          purgedCount++;
        } else {
          uniqueNames.add(cmd.name);
        }
      }

      await interaction.editReply({ content: `${EMOJIS.check} State normalized! Cleaned up \`${purgedCount}\` duplicate guild application endpoints.` });
    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: `${EMOJIS.danger} High-level permissions constraint block; failed to filter active command array.` });
    }
  }
};