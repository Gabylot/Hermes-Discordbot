import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const eventsDir = join(__dirname, '..', 'events');

export async function loadEvents(client) {
  const files = (await readdir(eventsDir)).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const event = await import(`../events/${file}`);
    const evt = event.default;

    if (evt.once) {
      client.once(evt.name, (...args) => evt.execute(...args));
    } else {
      client.on(evt.name, (...args) => evt.execute(...args, client));
    }

    console.log(`[events] loaded: ${evt.name}`);
  }
}