import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const commandsDir = join(__dirname, '..', 'commands');

export async function loadCommands(client) {
  try {
    const files = (await readdir(commandsDir)).filter(f => f.endsWith('.js'));

    for (const file of files) {
      const command = (await import(`../commands/${file}`)).default;

      client.commands.set(command.data.name, command);
      console.log(`[commands] loaded: /${command.data.name}`);
    }
  } catch (err) {
    // commands dir may not exist yet
    if (err.code !== 'ENOENT') throw err;
  }
}