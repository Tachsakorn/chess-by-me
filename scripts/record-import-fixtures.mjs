// Records real public API responses used as offline test fixtures for src/data.
// Run: node scripts/record-import-fixtures.mjs
// Writes into src/data/__fixtures__/. See the README there.
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', '__fixtures__');
mkdirSync(out, { recursive: true });
const headers = { 'User-Agent': 'chess-review-dev' };
const MAX_BYTES = 300 * 1024;

async function get(url, accept) {
  const res = await fetch(url, { headers: { ...headers, ...(accept ? { Accept: accept } : {}) } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.text();
}

function save(name, text) {
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error(`${name} is over 300 KB`);
  writeFileSync(join(out, name), text);
  console.log(`wrote ${name} (${Buffer.byteLength(text)} bytes)`);
}

// (a) Lichess: five newest games of a public account.
const lichess = await get(
  'https://lichess.org/api/games/user/EricRosen?max=5&pgnInJson=true&clocks=true&opening=true',
  'application/x-ndjson',
);
save('lichess-user.ndjson', lichess);

// (b) Chess.com: archive list of a public account.
const archivesText = await get('https://api.chess.com/pub/player/hikaru/games/archives');
save('chesscom-archives.json', archivesText);

// (c) Chess.com: the two newest archives, each trimmed to its last 6 games, plus one
// non-standard game (rules other than chess) per month if there is one.
const archives = JSON.parse(archivesText).archives;
async function month(url, name) {
  const games = JSON.parse(await get(url)).games;
  const last = games.slice(-6);
  const nonStandard = games.filter((g) => g.rules !== 'chess' && !last.includes(g)).slice(-1);
  console.log(`${url}: ${games.length} games, non-standard kept: ${nonStandard.length}`);
  save(name, JSON.stringify({ games: [...nonStandard, ...last] }, null, 1));
}
await month(archives[archives.length - 1], 'chesscom-month.json');
await month(archives[archives.length - 2], 'chesscom-prev-month.json');
