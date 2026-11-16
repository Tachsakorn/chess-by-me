// Adds to dist/ the files chessby.me needs (Fable review A9-01). Run by `npm run
// build:production`, after the normal build: the security and cache headers of
// scripts/site-files.mjs without noindex, Stockfish full left out, and a robots.txt that lets
// search engines in (without it, /robots.txt would answer with the app's page).
import { fileURLToPath } from 'node:url';
import { writeSiteFiles } from './site-files.mjs';

writeSiteFiles(fileURLToPath(new URL('../dist/', import.meta.url)), {
  noindex: false,
  extra: { 'robots.txt': 'User-agent: *\nAllow: /\n' },
});
