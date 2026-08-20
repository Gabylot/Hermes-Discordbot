import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modalsDir = join(__dirname, '..', 'modals');

export async function loadModals(client) {
  try {
    const files = (await readdir(modalsDir)).filter(f => f.endsWith('.js'));

    for (const file of files) {
      const mod = await import(`../modals/${file}`);

      // A file may export a single handler or an array of them
      const modals = Array.isArray(mod.default) ? mod.default : [mod.default];

      for (const modal of modals) {
        client.modals.set(modal.customId.split(':')[0], modal);
        console.log(`[modals] loaded: ${modal.customId.split(':')[0]}`);
      }
    }
  } catch (err) {
    // modals dir may not exist yet
    if (err.code !== 'ENOENT') throw err;
  }
}