import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const selectsDir = join(__dirname, '..', 'selects');

export async function loadSelectHandlers(client) {
  try {
    const files = (await readdir(selectsDir)).filter(f => f.endsWith('.js'));

    for (const file of files) {
      const mod = await import(`../selects/${file}`);

      // A file may export a single handler or an array of them
      const selects = Array.isArray(mod.default) ? mod.default : [mod.default];

      for (const select of selects) {
        client.selects.set(select.customId.split(':')[0], select);
        console.log(`[selects] loaded: ${select.customId.split(':')[0]}`);
      }
    }
  } catch (err) {
    // selects dir may not exist yet
    if (err.code !== 'ENOENT') throw err;
  }
}