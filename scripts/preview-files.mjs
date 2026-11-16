// Adds to dist/ the files the trial copy at preview.chessbyme.workers.dev needs (owner,
// 2026-11-15). Run by `npm run build:preview`, after the normal build. The same security and
// cache headers as chessby.me (scripts/site-files.mjs), plus "X-Robots-Tag: noindex" on every
// file, so search engines leave the trial alone. (No Cloudflare Access: it would make the
// home-screen and offline tests unreliable.)
import { fileURLToPath } from 'node:url';
import { writeSiteFiles } from './site-files.mjs';

// fileURLToPath, not URL.pathname: on Windows .pathname gives "/D:/..." (2026-11-15).
writeSiteFiles(fileURLToPath(new URL('../dist/', import.meta.url)), { noindex: true });
