// Builds src/analysis/classify/openings.json: every named opening position of
// Lichess's opening list, keyed by EPD (the first four fields of a FEN).
//
// Source: https://github.com/lichess-org/chess-openings (CC0-1.0), files a.tsv to
// e.tsv, at the commit pinned below. Each row is "eco <tab> name <tab> pgn"; the
// row names the position reached at the END of its moves. The moves are replayed
// with chess.js so the keys are spelled exactly as chess.js spells the FENs of an
// imported game (en passant square only when a capture is really possible).
//
// Usage: node scripts/build-openings.mjs [commit]
// The output is formatted with the project's Prettier settings so that
// `npm run format` leaves it unchanged.

import { Chess } from 'chess.js';
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const DEFAULT_COMMIT = '3ba6b20d31b2e6125cb0e6a2e792f400717d9d39';
const commit = process.argv[2] ?? DEFAULT_COMMIT;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'src/analysis/classify/openings.json');

const book = {};
let rows = 0;
let duplicates = 0;
let longestLine = 0;

for (const letter of 'abcde') {
  const url = `https://raw.githubusercontent.com/lichess-org/chess-openings/${commit}/${letter}.tsv`;
  const response = await fetch(url, { headers: { 'User-Agent': 'chess-review-dev' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const lines = (await response.text()).split('\n');
  if (lines[0]?.trim() !== 'eco\tname\tpgn') {
    throw new Error(`${letter}.tsv: unexpected header "${lines[0]}"`);
  }
  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue;
    const [eco, name, pgn] = line.split('\t').map((field) => field.trim());
    if (!eco || !name || !pgn) throw new Error(`${letter}.tsv: malformed row "${line}"`);
    const sans = pgn.split(/\s+/).filter((token) => !/^\d+\.+$/.test(token));
    const board = new Chess();
    for (const san of sans) board.move(san); // throws on an illegal move
    const epd = board.fen().split(' ').slice(0, 4).join(' ');
    rows += 1;
    longestLine = Math.max(longestLine, sans.length);
    if (epd in book) {
      // The same position reached by two rows: the first row keeps the name.
      duplicates += 1;
      console.warn(`duplicate position: "${name}" (${eco}) is already "${book[epd][1]}"`);
      continue;
    }
    book[epd] = [eco, name];
  }
}

const options = (await prettier.resolveConfig(outFile)) ?? {};
const text = await prettier.format(JSON.stringify(book), { ...options, filepath: outFile });
writeFileSync(outFile, text);

console.log(`commit ${commit}`);
console.log(`rows ${rows}, positions ${Object.keys(book).length}, duplicates ${duplicates}`);
console.log(`longest line: ${longestLine} plies`);
console.log(`${outFile}: ${Buffer.byteLength(text)} bytes on disk`);
console.log(`minified: ${Buffer.byteLength(JSON.stringify(book))} bytes`);
