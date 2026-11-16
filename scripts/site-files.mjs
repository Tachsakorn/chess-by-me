// The files that go next to the built app on Cloudflare (Workers static assets), shared by the
// trial copy (scripts/preview-files.mjs) and chessby.me (scripts/production-files.mjs), so the
// trial tests exactly the headers the real site will send (owner, 2026-11-15).
//
// - _headers: security headers (Fable review A3-01) and caching (A9-01). The trial copy adds
//   "X-Robots-Tag: noindex".
// - .assetsignore: leaves out Stockfish full (about 79 MB): the app runs the lite engine only.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Content-Security-Policy, as tight as the app allows:
 * - script 'wasm-unsafe-eval': Stockfish is WebAssembly (in its worker, which gets this header too).
 * - worker 'self': the engine's worker and the service worker are files of this site.
 * - style 'unsafe-inline': Chessground places pieces with inline styles.
 * - img data:: the cburnett pieces are data: images in Chessground's stylesheet.
 * - connect blob:: the engine reads the WebAssembly the app downloaded (src/analysis/browser.ts);
 *   Lichess and Chess.com are the only other sites the app talks to.
 * - frame-ancestors 'none': the site cannot be shown inside another site's frame.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' blob: https://lichess.org https://api.chess.com",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const STOCKFISH_FULL = /^engines\/stockfish-17\.1-single-/;

export function headersFile({ noindex }) {
  return [
    '/*',
    `  Content-Security-Policy: ${CSP}`,
    '  X-Content-Type-Options: nosniff',
    // Lichess and Chess.com still see which site asks (the origin), never the page.
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    '  X-Frame-Options: DENY',
    ...(noindex ? ['  X-Robots-Tag: noindex'] : []),
    '',
    // File names that carry a hash never change: keep them a year.
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/engines/stockfish-*',
    '  Cache-Control: public, max-age=31536000, immutable',
    // Always asked again, so a new version reaches everyone at their next visit.
    '/',
    '  Cache-Control: no-cache',
    '/index.html',
    '  Cache-Control: no-cache',
    '/sw.js',
    '  Cache-Control: no-cache',
    '/manifest.webmanifest',
    '  Cache-Control: no-cache',
    '',
  ].join('\n');
}

/** Writes _headers and .assetsignore into dist/ and prints what will be uploaded. */
export function writeSiteFiles(dist, { noindex, extra = {} }) {
  writeFileSync(join(dist, '_headers'), headersFile({ noindex }));
  writeFileSync(
    join(dist, '.assetsignore'),
    [
      '# Stockfish full: not used by the app (lite, depth 18)',
      'engines/stockfish-17.1-single-*',
      '',
    ].join('\n'),
  );
  for (const [name, text] of Object.entries(extra)) writeFileSync(join(dist, name), text);

  const ignored = (path) =>
    STOCKFISH_FULL.test(path) || ['_headers', '.assetsignore'].includes(path);
  const files = [];
  const walk = (dir, prefix = '') => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = prefix + name;
      if (statSync(full).isDirectory()) walk(full, `${rel}/`);
      else if (!ignored(rel)) files.push([rel, statSync(full).size]);
    }
  };
  walk(dist);
  files.sort(([a], [b]) => a.localeCompare(b));
  const total = files.reduce((sum, [, size]) => sum + size, 0);
  for (const [rel, size] of files)
    console.log(`${(size / 1024).toFixed(1).padStart(9)} KB  ${rel}`);
  console.log(`${files.length} files, ${(total / 1024 / 1024).toFixed(1)} MB to upload`);
  if (Math.max(...files.map(([, size]) => size)) > 25 * 1024 * 1024) {
    throw new Error('A file is over the 25 MB limit of Workers static assets');
  }
}
