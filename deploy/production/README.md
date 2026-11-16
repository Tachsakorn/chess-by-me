# chessby.me (the real site): deploy steps (run on the machine where wrangler is logged in)

Prepared on 2026-11-15 (Fable review A9-01). **Live since 2026-11-16 (version 1.0.0).** Every
later release: dry run, check it, then deploy, with the owner's yes. This is a separate Worker,
`chessbyme`, from the trial copy `preview` (`deploy/preview/`); neither touches the other.

Rules (owner):

- **Never run wrangler at the root of the repository.** Run it only from `deploy/production/`.
- **Dry run first, every time**, and show the owner the result before a real deploy.
- No `--force`. Do not touch other Workers. Do not merge into `main` without the owner.

## What is different from the trial copy

| | Trial copy (`deploy/preview`) | chessby.me (`deploy/production`) |
|---|---|---|
| Worker name | `preview` | `chessbyme` |
| Address | preview.chessbyme.workers.dev | chessby.me (and www.chessby.me, sent to chessby.me) |
| Build | `npm run build:preview` | `npm run build:production` |
| Search engines | `X-Robots-Tag: noindex` on every file | allowed; real `robots.txt` |
| Security and cache headers | the same (`scripts/site-files.mjs`) | the same |
| Stockfish full (79 MB) | left out | left out |
| Script | none (files only) | `worker.js`: www → chessby.me, then the files |

Headers on every file (`scripts/site-files.mjs`): Content-Security-Policy (only this site,
Lichess and Chess.com; WebAssembly allowed for Stockfish; no framing), `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (Lichess and Chess.com still see the
site's origin), `Permissions-Policy`, `X-Frame-Options: DENY`. Caching: `/assets/*` and
`/engines/stockfish-*` a year (their names carry a hash); `/`, `/index.html`, `/sw.js`,
`/manifest.webmanifest` always asked again.

`run_worker_first: true` makes every request go through `worker.js` (to catch www). On the free
plan that counts against 100,000 Worker requests a day. If that ever matters: set it to `false`,
remove `main` and the www route, and add a redirect rule for www.chessby.me in the Cloudflare
dashboard instead.

## Before the launch (checklist, from the review)

1. The owner has decided on the badge look (A5-03) and on publishing the source (A5-01, A9-02);
   `SOURCE_CODE_URL` in `src/ui/app/config.ts` holds the public repository's address, which shows
   the "Source code" rows.
2. chessby.me is active on Cloudflare (DNS; docs/STATUS.md last recorded "waiting for the
   registry"). The two custom domains are created by the deploy itself.
3. Version 1.0.0: `npm version 1.0.0 --no-git-tag-version` at the root, commit.
4. A real-device pass on the trial copy first (iPhone and iPad Safari, home screen, offline).

## 1. Dry run (from deploy/production)

```powershell
cd deploy/production
npx wrangler deploy --dry-run
```

Wrangler runs `npm run build:production` first and prints the files. Measured 2026-11-15
(version 0.9.3 code of round 38): **38 files, 8.4 MB to upload**; wrangler then says
`Read 50 files from the assets directory` (it counts folders too), `Total Upload: 0.35 KiB`
(the script), bindings `env.ASSETS  Assets`, `--dry-run: exiting now.`
Then `git status --short` at the root must show nothing new.

**Stop here and show the owner. Deploy only after they say yes, on launch day.**

## 2. Deploy (launch day, after the owner's yes)

```powershell
npx wrangler deploy
```

Wrangler should name `chessby.me` and `www.chessby.me` as custom domains of the Worker
`chessbyme`. If it asks to change anything else, stop and ask the owner.

## 3. Check the live site

```powershell
curl.exe -sI https://chessby.me/ | Select-String -Pattern 'HTTP|content-security|x-robots|cache-control'
curl.exe -sI https://chessby.me/review/lichess%3AabcDEF12 | Select-String -Pattern 'HTTP|content-type'
curl.exe -sI https://chessby.me/engines/stockfish-17.1-lite-single-03e3232.wasm | Select-String -Pattern 'HTTP|content-type|cache-control'
curl.exe -sI https://www.chessby.me/settings | Select-String -Pattern 'HTTP|location'
curl.exe -s https://chessby.me/robots.txt
```

Expected: `200` with the CSP and no `x-robots-tag`; `text/html` for the review address;
`application/wasm` with a year's cache; `301` to `https://chessby.me/settings`; `Allow: /`.
Then open chessby.me in Edge (the Connect screen shows, no errors in the console) and analyse one
game. Record the result in `docs/STATUS.md`.

## Checked on 2026-11-15 (nothing uploaded)

- The dry run above.
- The same files served on this PC by `npx wrangler dev --local` (from this folder): the headers
  above on `/`, `/review/...`, the wasm (with its type and cache), the notices file; Stockfish
  full not served; `robots.txt` served.
- `worker.js` called directly in Node: `https://www.chessby.me/review/x?a=1` → `301`
  `https://chessby.me/review/x?a=1`; `https://chessby.me/settings` → the files.
- Not checked: the custom domains themselves and HTTPS (only a real deploy can show them).

## Checked on 2026-11-16 (launch, 1.0.0 live)

- Dry run: 38 files, 8.5 MB; Stockfish full not in the list; no noindex; the five headers above.
- Deploy: Worker `chessbyme`, custom domains `chessby.me` and `www.chessby.me`.
- Live: `/` 200 with the CSP and no `x-robots-tag`; the wasm `application/wasm` with a year's
  cache; `www.chessby.me/settings?a=1` → `301` `https://chessby.me/settings?a=1`; `robots.txt`
  `Allow: /`; HTTPS certificate for `chessby.me` and `*.chessby.me`.
- Found: `http://chessby.me/` answers 200 without moving to `https://` (Cloudflare's "Always Use
  HTTPS" is off), and Cloudflare adds its Web Analytics script to the page, which the CSP blocks
  (an error in the console, nothing sent). Both are settings in the Cloudflare dashboard.
