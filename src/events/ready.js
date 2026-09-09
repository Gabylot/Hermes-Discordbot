import { REST, Routes } from 'discord.js';

async function registerCommands(client) {
  const commands = [...client.commands.values()].map(c => c.data.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  // Register guild-scoped when a guild ID is set (instant updates), otherwise globally
  const route = process.env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);

  await rest.put(route, { body: commands });
  console.log(`[commands] registered ${commands.length} slash command(s)`);
}

export default {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`[bot] logged in as ${client.user.tag}`);
    client.user.setActivity('CWD Logistics', { type: 3 }); // Watching

    // Register slash commands
    try {
      await registerCommands(client);
    } catch (err) {
      console.error(`[commands] failed to register slash commands:`, err.message);
    }
  },
};