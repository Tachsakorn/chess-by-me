// Builds the picture a shared link shows (Open Graph / Twitter card), 1200x630, from the app's own
// design: the white ground, the app icon, Inter + Anuphan, and a board in the blue set with the
// cburnett pieces (the same pieces the app draws, GPL-2.0-or-later, see docs/STACK.md). No
// screenshot of the app, so no account name can end up in it (owner, 2026-11-16).
//
//   node scripts/make-og.mjs        (CHROMIUM_PATH=/opt/pw-browsers/chromium in cloud sessions)
//
// The board shows the Ruy Lopez after 1. e4 e5 2. Nf3 Nc6 3. Bb5, the last move highlighted.
// Writes public/og.png.
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(
  join(root, 'node_modules/@lichess-org/chessground/assets/chessground.cburnett.css'),
  'utf8',
);
const ROLES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** The cburnett piece as a data: URL, read from Chessground's stylesheet. */
function piece(letter) {
  const color = letter === letter.toUpperCase() ? 'white' : 'black';
  const role = ROLES[letter.toLowerCase()];
  const match = new RegExp(
    `piece\\.${role}\\.${color}\\s*\\{\\s*background-image:\\s*url\\('(data:image\\/svg\\+xml;base64,[^']+)'\\)`,
  ).exec(css);
  if (!match) throw new Error(`No ${color} ${role} in chessground.cburnett.css`);
  return match[1];
}

/** Fonts as data: URLs, so the page needs no server. */
function font(path) {
  return `data:font/woff2;base64,${readFileSync(join(root, 'node_modules/@fontsource', path)).toString('base64')}`;
}

const FEN = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R';
const LAST_MOVE = ['f1', 'b5'];
const icon = readFileSync(join(root, 'public/icons/icon.svg'), 'utf8');

const squares = [];
FEN.split('/').forEach((row, r) => {
  let f = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) {
      for (let i = 0; i < Number(ch); i += 1) squares.push({ r, f: f++, p: null });
    } else squares.push({ r, f: f++, p: ch });
  }
});
const board = squares
  .map(({ r, f, p }) => {
    const name = `${'abcdefgh'[f]}${8 - r}`;
    const light = (r + f) % 2 === 0;
    const hl = LAST_MOVE.includes(name);
    const bg = hl ? (light ? '#f2e7a6' : '#d3bd62') : light ? '#e3eaf3' : '#8ea6c6';
    const img = p ? `<img src="${piece(p)}" alt="">` : '';
    return `<div style="background:${bg}">${img}</div>`;
  })
  .join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Inter; font-weight: 400; src: url(${font('inter/files/inter-latin-400-normal.woff2')}); }
@font-face { font-family: Inter; font-weight: 600; src: url(${font('inter/files/inter-latin-600-normal.woff2')}); }
@font-face { font-family: Inter; font-weight: 700; src: url(${font('inter/files/inter-latin-700-normal.woff2')}); }
@font-face { font-family: Anuphan; font-weight: 500; src: url(${font('anuphan/files/anuphan-thai-500-normal.woff2')}); }
@font-face { font-family: Anuphan; font-weight: 600; src: url(${font('anuphan/files/anuphan-thai-600-normal.woff2')}); }
html, body { margin: 0; width: 1200px; height: 630px; background: #ffffff; color: #1d1d1f; }
body { font-family: Inter, Anuphan, sans-serif; display: flex; align-items: center; gap: 64px; padding: 0 72px; box-sizing: border-box; }
.text { flex: 1; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 20px; }
.brand svg { width: 72px; height: 72px; border-radius: 16px; }
.name { font-size: 56px; font-weight: 700; letter-spacing: -0.02em; }
.en { margin-top: 40px; font-size: 44px; line-height: 1.15; font-weight: 700; letter-spacing: -0.02em; }
.th { margin-top: 16px; font-family: Anuphan, Inter, sans-serif; font-size: 34px; line-height: 1.4; font-weight: 600; }
.small { margin-top: 32px; font-size: 24px; line-height: 1.4; font-weight: 400; color: #6e6e73; }
.board { width: 456px; height: 456px; flex: none; display: grid; grid-template-columns: repeat(8, 1fr); border-radius: 12px; overflow: hidden; }
.board div { position: relative; }
.board img { position: absolute; inset: 0; width: 100%; height: 100%; }
</style></head><body>
<div class="text">
  <div class="brand">${icon.replace('<svg ', '<svg aria-hidden="true" ')}<span class="name">Chess by me</span></div>
  <div class="en">Free, unlimited chess game review</div>
  <div class="th">รีวิวเกมหมากรุกฟรี ไม่จำกัด</div>
  <div class="small">Lichess and Chess.com games, analysed by Stockfish in your browser</div>
</div>
<div class="board">${board}</div>
</body></html>`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate("document.fonts.ready");
const out = join(root, 'public/og.png');
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log(
  `public/og.png 1200x630 (${(Buffer.byteLength(readFileSync(out)) / 1024).toFixed(0)} KB)`,
);
