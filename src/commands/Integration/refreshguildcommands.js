import { SlashCommandBuilder, PermissionFlagsBits, REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  data: new SlashCommandBuilder()
    .setName('refreshguildcommands')
    .setDescription('🔄 Recalculate and synchronize application commands across this server guild.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply({ flags: ['Ephemeral'] });
    
    try {
      const commands = [];
      // Adjust path to find the base 'commands' directory from inside commands/Integration/
      const foldersPath = path.join(__dirname, '..', '..', 'commands');
      const commandFolders = fs.readdirSync(foldersPath);

      for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        if (!fs.lstatSync(commandsPath).isDirectory()) continue;
        
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
          const filePath = path.join(commandsPath, file);
          const fileUrl = `file://${filePath}`;
          const { default: command } = await import(fileUrl);
          
          if (command && 'data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
          }
        }
      }

      const rest = new REST().setToken(interaction.client.token);
      await rest.put(
        Routes.applicationGuildCommands(interaction.client.user.id, interaction.guildId),
        { body: commands }
      );

      await interaction.editReply({ content: `✅ Complete! Re-synchronized \`${commands.length}\` slash definitions into this guild context.` });
    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: '❌ Failed to dynamically compile local modules structure.' });
    }
  }
};