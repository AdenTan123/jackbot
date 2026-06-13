const { REST, Routes } = require('discord.js');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);




// for global commands
rest
	.delete(Routes.applicationCommand(process.env.CLIENT_ID, '1515184039223361602'))
	.then(() => console.log('Successfully deleted application command'))
	.catch(console.error);
