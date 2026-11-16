// Downloads a few analysed Lichess games with Lichess's own per-player accuracy,
// used to cross-check src/analysis/accuracy against Lichess.
//
// Usage: node scripts/fetch-lichess-accuracy-sample.mjs [username] [max]
// Writes src/analysis/accuracy/__fixtures__/lichess-analysed.ndjson.
// Lichess answers 404 to requests without an explicit User-Agent.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const user = process.argv[2] ?? 'EricRosen';
const max = Number(process.argv[3] ?? 5);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src/analysis/accuracy/__fixtures__/lichess-analysed.ndjson');

const url =
  `https://lichess.org/api/games/user/${encodeURIComponent(user)}` +
  `?max=${max}&analysed=true&evals=true&accuracy=true&pgnInJson=true`;

const res = await fetch(url, {
  headers: { Accept: 'application/x-ndjson', 'User-Agent': 'chess-review-dev' },
});
if (!res.ok) {
  console.error(`HTTP ${res.status} for ${url}`);
  process.exit(1);
}
const lines = (await res.text()).split('\n').filter((l) => l.trim() !== '');
const games = lines.map((l) => JSON.parse(l));
const usable = games.filter(
  (g) =>
    g.players?.white?.analysis?.accuracy != null && g.players?.black?.analysis?.accuracy != null,
);
if (usable.length === 0) {
  console.error(`No analysed games with accuracy for ${user}`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, usable.map((g) => JSON.stringify(g)).join('\n') + '\n');
console.log(`Saved ${usable.length} of ${games.length} games for ${user} to ${out}`);
for (const g of usable) {
  console.log(
    g.id,
    g.speed,
    g.status,
    g.winner ?? 'draw',
    `moves=${g.moves.split(' ').length}`,
    `evals=${g.analysis?.length}`,
    `acc w=${g.players.white.analysis.accuracy} b=${g.players.black.analysis.accuracy}`,
  );
}
