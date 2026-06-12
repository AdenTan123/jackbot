import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const guildId = process.env.GUILD_ID;
const clientId = process.env.CLIENT_ID;

console.log('Clearing guild commands...');
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
console.log('✅ Guild commands cleared!');