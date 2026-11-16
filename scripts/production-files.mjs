// Adds to dist/ the files chessby.me needs (Fable review A9-01). Run by `npm run
// build:production`, after the normal build: the security and cache headers of
// scripts/site-files.mjs without noindex, Stockfish full left out, and a robots.txt that lets
// search engines in (without it, /robots.txt would answer with the app's page) and names the
// sitemap. The sitemap lists only the home page (owner, 2026-11-16, 1.0.2): every address of the
// app serves the same page, and the others (a review, My Games, Settings) show what is on the
// visitor's own device, nothing a search engine should list. Only chessby.me gets these two
// files; the trial copy keeps noindex and no sitemap.
import { fileURLToPath } from 'node:url';
import { writeSiteFiles } from './site-files.mjs';

writeSiteFiles(fileURLToPath(new URL('../dist/', import.meta.url)), {
  noindex: false,
  extra: {
    'robots.txt': 'User-agent: *\nAllow: /\n\nSitemap: https://chessby.me/sitemap.xml\n',
    'sitemap.xml': [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      '  <url>',
      '    <loc>https://chessby.me/</loc>',
      '  </url>',
      '</urlset>',
      '',
    ].join('\n'),
  },
});
