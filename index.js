import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { loadEvents } from './handlers/eventHandler.js';
import { loadButtons } from './handlers/buttonHandler.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Attach collections to client so handlers can access them
client.buttons = new Collection();

await loadEvents(client);
await loadButtons(client);

client.login(process.env.DISCORD_TOKEN);
