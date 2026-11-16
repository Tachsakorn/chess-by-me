// Copies the Stockfish builds the app ships into public/engines/ (git-ignored).
// Stockfish is GPL-3.0; its licence text is copied next to the binaries.
import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules/stockfish/src');
const to = join(root, 'public/engines');

// Single-threaded builds only: they need no cross-origin isolation headers.
const wanted = /^stockfish-17\.1-(lite-single|single)-[0-9a-f]+(-part-\d)?\.(js|wasm)$/;

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });

const files = [];
for (const name of readdirSync(from)) {
  if (!wanted.test(name)) continue;
  cpSync(join(from, name), join(to, name));
  files.push({ name, bytes: statSync(join(from, name)).size });
}
cpSync(join(root, 'node_modules/stockfish/Copying.txt'), join(to, 'COPYING-stockfish.txt'));
writeFileSync(join(to, 'manifest.json'), JSON.stringify({ stockfish: '17.1.0', files }, null, 2));

const largest = Math.max(...files.map((f) => f.bytes));
console.log(`copied ${files.length} engine files, largest ${(largest / 1048576).toFixed(2)} MiB`);
if (largest > 25 * 1048576) {
  console.error('An engine file exceeds the 25 MiB Cloudflare Pages asset limit.');
  process.exit(1);
}
