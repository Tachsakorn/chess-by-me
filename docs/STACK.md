# Stack and dependencies

Chess by me is a single-page web app that runs entirely in the browser; there is no server of
its own. It is built with React, TypeScript and Vite and served as static files from Cloudflare
Workers (the real site's settings are in `deploy/production/`). Everything below is open source
and compatible with GPL-3.0; nothing is paid for. Exact versions are locked in
`package-lock.json`.

## Shipped to users

| Package | Version | Licence | Used for |
|---|---|---|---|
| react, react-dom | 19.3.1 | MIT | rendering the screens |
| scheduler | 0.28.0 | MIT | comes with react-dom |
| react-router | 8.5.1 | MIT | pages, and a shareable address for every game |
| @remix-run/route-pattern, cookie-es | 0.22.1, 3.1.1 | MIT | come with react-router |
| zustand | 5.1.0 | MIT | app state, including results that stream in move by move |
| chess.js | 1.4.0 | BSD-2-Clause | chess rules and PGN |
| @lichess-org/chessground | 10.5.0 | GPL-3.0-or-later | the board (Lichess's board library) |
| stockfish | 17.1.0 | GPL-3.0 | the engine; the app uses the single-threaded lite build |
| idb | 8.0.4 | ISC | storing games and analyses in the browser (IndexedDB) |
| @fontsource/inter, @fontsource/anuphan | 5.3.0 | OFL-1.1 | self-hosted fonts for devices without the Apple system font: Inter (Latin), Anuphan (Thai) |
| cburnett pieces (Colin M.L. Burnett) | — | GPL-2.0-or-later | pieces on the board and in the app icon; read from the CSS shipped with chessground |
| lichess-org/chess-openings | — | CC0-1.0 | opening names (`src/analysis/classify/openings.json`, built by `scripts/build-openings.mjs`) |

Written without a library: the evaluation graph and bar (SVG), the two-language text system, move
classification, accuracy and the rating estimate. These are the core of the app's look and
results, and writing them keeps every detail under control without adding licences.

The move sounds are the project's own: made in code with the Web Audio API (`src/ui/sound/`),
with no sound files. No sounds from Chess.com or Lichess are used.

Styling is plain CSS with custom properties (the tokens in `src/styles/tokens.css`, described in
`DESIGN.md`); there is no CSS framework or component kit.

## Development only

| Package | Version | Licence | Used for |
|---|---|---|---|
| vite, @vitejs/plugin-react | 8.3.8, 6.3.0 | MIT | development server and build |
| typescript | 6.0.3 | Apache-2.0 | type checking (6, because typescript-eslint does not support 7 yet) |
| vitest | 5.1.0 | MIT | unit tests |
| @playwright/test | 1.65.0 | Apache-2.0 | browser tests in `e2e/` |
| eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks | 10.14.0, 10.0.1, 8.72.2, 7.1.1 | MIT | linting, including the rule that keeps UI code out of the analysis and data layers |
| prettier | 3.10.1 | MIT | formatting |
| @types/react, @types/react-dom, @types/node | 19.3.0, 19.3.0, 26.6.6 | MIT | type definitions |
| wrangler | 4.161.0 | MIT OR Apache-2.0 | deploying to Cloudflare |

## Licence files

- `LICENSE`: the full GPL-3.0 text. The app as a whole is GPL-3.0-or-later.
- `THIRD-PARTY-NOTICES.txt` is written into `dist/` at build time by
  `scripts/third-party-notices.mjs`, from the licence files of the packages that are really in
  the bundle, plus Stockfish (copied separately) and the credits that are not packages
  (WintrChess, Lichess, Colin M.L. Burnett, the Stockfish authors, the font designers). The
  app's "Open-source licenses" page links to it.

## Outside services the app calls (no keys)

- Lichess API: `/api/games/user/{username}` (NDJSON) for a user's games, and single games by id.
- Chess.com Published-Data API: a user's monthly game archives.

Lichess answers 404 to some automated clients (for example curl's default user agent or a headless
browser); ordinary browsers are not affected. See `docs/sources/import.md` for the request rules
the app follows.

## Projects read for method, not code

| Project | Licence | How it is used |
|---|---|---|
| WintrCat/wintrchess | GPL-3.0 | the expected-points move classification and piece-safety checks; credited |
| GuillaumeSD/Chesskit | AGPL-3.0 | no code copied |
| lichess-org/lila | AGPL-3.0 | only the published accuracy formula, implemented independently; no code copied |

The source of every formula is recorded in `docs/sources/` (`import.md`, `accuracy-rating.md`,
`engine.md`, `classification.md`).

## Notes

1. **Stockfish 17.1.** The npm package has no 17.0. Its full build is split into six parts of
   12.6 MB, under Cloudflare's 25 MB limit per file; the app uses only the lite build and does
   not deploy the full one. `scripts/copy-engines.mjs` copies the engine files into `public/` at
   build time.
2. **chessground's package name.** The old `chessground` package on npm is deprecated; Lichess
   publishes the same library, under the same licence, as `@lichess-org/chessground`.
3. **App icon.** The white cburnett knight on a 2×2 board in the app's board colours, generated
   by `node scripts/make-icons.mjs` into `public/icons/` and `public/favicon.svg`. No other fonts
   or pictures are involved.

## Layout

```
src/
  contract/    types shared by the analysis, the data layer and the UI
  data/        fetching games (Lichess, Chess.com, PGN) and storing them in the browser
  analysis/    engine, classification, accuracy, rating; no UI code
  ui/          screens and components; no analysis formulas
  i18n/        all text, English and Thai
  styles/      design tokens
fixtures/      real games with their analysis, for development and tests only
e2e/           browser tests
dev/           development pages served only by the dev server
docs/          STACK, CONTRACT, CALIBRATION, sources/
```

Unit tests sit next to the code they test (`*.test.ts`).
