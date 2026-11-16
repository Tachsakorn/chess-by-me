// Builds every app icon from one SVG (owner's choice "A, Board", 2026-11-15):
// a 2x2 board in the blue set (#E3EAF3 / #8EA6C6, light squares top-left and bottom-right)
// with the white cburnett knight in the middle, 75.5% of the icon wide (58% for the maskable
// icon, inside Android's safe zone). Square, opaque, no rounded corners, shadow, border or
// gradient: iOS and Android cut the corners themselves.
//
//   node scripts/make-icons.mjs        (CHROMIUM_PATH=/opt/pw-browsers/chromium in cloud sessions)
//
// The knight is read from @lichess-org/chessground's cburnett stylesheet, the same pieces the
// app draws (GPL-2.0-or-later, see docs/STACK.md). PNGs are drawn by Chromium from the SVG.
// Writes public/icons/ and public/favicon.svg.
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(
  join(root, 'node_modules/@lichess-org/chessground/assets/chessground.cburnett.css'),
  'utf8',
);
const match =
  /piece\.knight\.white\s*\{\s*background-image:\s*url\('data:image\/svg\+xml;base64,([^']+)'\)/.exec(
    css,
  );
if (!match) throw new Error('No white knight in chessground.cburnett.css');
const knight = Buffer.from(match[1], 'base64').toString('utf8');
const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(knight)?.[1];
if (!inner) throw new Error('Unreadable knight SVG');

const SIZE = 1024;
const LIGHT = '#E3EAF3';
const DARK = '#8EA6C6';

/** The icon as SVG: `share` is the knight's width as a part of the icon (0.755 or 0.58). */
function iconSvg(share) {
  const half = SIZE / 2;
  const w = SIZE * share;
  const at = (SIZE - w) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
<rect x="0" y="0" width="${half}" height="${half}" fill="${LIGHT}"/>
<rect x="${half}" y="0" width="${half}" height="${half}" fill="${DARK}"/>
<rect x="0" y="${half}" width="${half}" height="${half}" fill="${DARK}"/>
<rect x="${half}" y="${half}" width="${half}" height="${half}" fill="${LIGHT}"/>
<svg x="${at}" y="${at}" width="${w}" height="${w}" viewBox="0 0 45 45">${inner}</svg>
</svg>
`;
}

const out = join(root, 'public/icons');
mkdirSync(out, { recursive: true });
const standard = iconSvg(0.755);
const maskable = iconSvg(0.58);
writeFileSync(join(out, 'icon.svg'), standard);
writeFileSync(join(out, 'icon-maskable.svg'), maskable);
writeFileSync(join(root, 'public/favicon.svg'), standard);

const files = [
  ['apple-touch-icon.png', standard, 180],
  ['icon-192.png', standard, 192],
  ['icon-512.png', standard, 512],
  ['icon-maskable-512.png', maskable, 512],
  ['favicon-32.png', standard, 32],
];
const browser = await launchBrowser();
const page = await browser.newPage();
for (const [name, svg, size] of files) {
  await page.setViewportSize({ width: size, height: size });
  const scaled = svg.replace(
    `width="${SIZE}" height="${SIZE}"`,
    `width="${size}" height="${size}"`,
  );
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:${LIGHT}">${scaled}</body></html>`,
  );
  await page.screenshot({ path: join(out, name), clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`public/icons/${name} ${size}x${size}`);
}
await browser.close();
