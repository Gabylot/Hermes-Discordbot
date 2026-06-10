import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const buttonsDir = join(__dirname, '..', 'buttons');

export async function loadButtons(client) {
  try {
    const files = (await readdir(buttonsDir)).filter(f => f.endsWith('.js'));

    for (const file of files) {
      const mod = await import(`../buttons/${file}`);

      // A file may export a single button or an array of them
      const buttons = Array.isArray(mod.default) ? mod.default : [mod.default];

      for (const button of buttons) {
        client.buttons.set(button.customId.split(':')[0], button);
        console.log(`[buttons] loaded: ${button.customId.split(':')[0]}`);
      }
    }
  } catch (err) {
    // buttons dir may not exist yet
    if (err.code !== 'ENOENT') throw err;
  }
}