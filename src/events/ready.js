import { REST, Routes } from 'discord.js';
import { syncTickets, syncLeaderboard, postDeliveryRequestButton } from '../utils/ticketPoster.js';

const TICKET_TYPES = ['mpf', 'factory', 'resources', 'vehicles_structures'];

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

    // Sync tickets — edits existing messages, posts new ones only when needed
    for (const type of TICKET_TYPES) {
      await syncTickets(client, type);
    }

    // Post delivery request button
    try {
      await postDeliveryRequestButton(client);
      console.log(`[sync] delivery button posted`);
    } catch (err) {
      console.error(`[sync] delivery button failed:`, err.message);
    }

    // Sync leaderboard
    try {
      await syncLeaderboard(client);
      console.log(`[sync] leaderboard posted`);
    } catch (err) {
      console.error(`[sync] leaderboard failed:`, err.message);
    }
  },
};