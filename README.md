# Chess by me

Chess by me reviews your chess games in the browser. Connect a Lichess or Chess.com username, or
paste a PGN, and every move is analysed on your own device with Stockfish: move labels from
Brilliant to Blunder, accuracy for both players, an estimated rating range, the evaluation graph
and the opening. Nothing is sent to a server of ours; games are fetched from the public Lichess
and Chess.com APIs and kept in the browser's storage. English and Thai.

Use it at **[chessby.me](https://chessby.me)**.

## Running it

Needs Node.js 24 or newer.

```bash
npm install
npm run dev          # development server at http://localhost:5173
npm run check        # type check, lint, unit tests and production build
npm run e2e          # browser tests (Playwright; uses the installed Microsoft Edge,
                     # or set CHROMIUM_PATH to a Chromium binary)
npm run build        # production build in dist/
```

`dev/seed/` (development server only) loads the real-game fixtures in `fixtures/` into the app's
storage so the screens can be tried without connecting an account.

Where things are: `src/analysis` (engine, move labels, accuracy, rating), `src/data` (fetching
and storing games), `src/contract` (the types between the two and the UI), `src/ui` (screens),
`src/i18n` (all text). The sources of every formula are in `docs/sources/`, the dependencies and
their licences in `docs/STACK.md`.

## Credits

- **[Stockfish](https://stockfishchess.org)** 17.1 (GPL-3.0), through the
  [stockfish](https://www.npmjs.com/package/stockfish) npm package: the engine.
- **[chessground](https://github.com/lichess-org/chessground)** by Lichess (GPL-3.0-or-later):
  the board.
- **cburnett** chess pieces by Colin M.L. Burnett (GPL-2.0-or-later), as shipped with
  chessground: the pieces and the app icon.
- **[WintrChess](https://github.com/WintrCat/wintrchess)** (GPL-3.0): the move classification
  method (expected points, piece safety); see `docs/sources/classification.md`.
- **Lichess accuracy method**: the published accuracy formula, implemented independently (no
  Lichess code); see `docs/sources/accuracy-rating.md`.
- **[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)** (CC0-1.0):
  opening names.
- **Fonts**: Inter and Anuphan (both SIL Open Font License 1.1), through
  [Fontsource](https://fontsource.org).

The full licence texts of everything the app ships are collected into `THIRD-PARTY-NOTICES.txt`
at build time (`scripts/third-party-notices.mjs`) and linked from the app's licences page.

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE).
