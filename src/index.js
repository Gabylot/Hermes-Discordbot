import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { loadEvents } from './handlers/eventHandler.js';
import { loadButtons } from './handlers/buttonHandler.js';
import { loadCommands } from './handlers/commandHandler.js';
import { loadSelectHandlers } from './handlers/selectHandlers.js';
import { loadModals } from './handlers/modalHandler.js';
import { shutdown as shutdownRenderer } from './utils/routeImage.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Attach collections to client so handlers can access them
client.commands = new Collection();
client.buttons = new Collection();
client.selects = new Collection();
client.modals = new Collection();

await loadEvents(client);
await loadButtons(client);
await loadCommands(client);
await loadSelectHandlers(client);
await loadModals(client);

// The route renderer keeps a headless Chrome alive between requests. Without
// this, stopping the bot would leave orphaned browser processes behind.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    console.log(`[bot] ${signal} received, shutting down route renderer`);
    shutdownRenderer()
      .catch(() => {})
      .finally(() => process.exit(0));
  });
}

client.login(process.env.DISCORD_TOKEN);