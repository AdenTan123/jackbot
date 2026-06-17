export async function deleteGuildData(client, guildId) {
  // Initialize database if needed
  await initializeDatabase(client);

  try {
    // Delete applications
    await db.deleteFromDb(`guild:${guildId}:applications`);

    // Delete birthdays
    await db.deleteFromDb(`guild:${guildId}:birthdays`);

    // Delete leveling data
    await db.deleteFromDb(`guild:${guildId}:leveling`);

    // Optional: Delete guild config
    // await db.deleteFromDb(`guild:${guildId}:config`);

    console.log(`Guild data deleted for guild ${guildId}`);
  } catch (error) {
    console.error(`Failed to delete guild data for ${guildId}:`, error);
  }
}
