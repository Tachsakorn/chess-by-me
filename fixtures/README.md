# Fixtures

Real games with their analysis, for developing and testing. Development only: nothing here is
product data, and nothing in `src/` outside test files reads it.

Each folder holds:

| File | What it is |
|---|---|
| `game.pgn` | The game as the source gave it. |
| `source.json` | Optional: facts known from the source that the PGN does not carry (id, link). |
| `game.json` | The game as a `GameRecord`, built by the import code (`src/data`). |
| `analysis.json` | The `GameAnalysis` with Stockfish **full**, depth 18, built by the real analysis code. The tests of `src/analysis` read this one: they check the rules that turn evaluations into categories, and their pinned values come from it. Its evaluations are from before 2026-11-15's change of method (one engine, its hash carried from position to position) and are kept on purpose; the categories are rebuilt with today's rules. |
| `fixture.json` | How `analysis.json` was made: where the game came from, engine, depth, machine, time. |
| `analysis-lite.json` | The same game with Stockfish **lite**, depth 18: exactly what the app computes. Re-evaluated on 2026-11-15 with every position searched from a cleared engine, as the app now does (speed round); the browser with four engines gives the same evaluations (see docs/BENCHMARKS.md). The screens, `dev/seed/` and the UI tests read this one. |
| `fixture-lite.json` | How `analysis-lite.json` was made. |
| `engine-raw-lite.json` | `lichess-LAGvRNey` only: the raw Stockfish lite output (every depth's lines as the engine sent them, depth 18, 2 lines, a cleared engine per position) of the position before each of its 85 moves. Recorded on 2026-11-26 **before** the engine gained time-limited searches for the analysis board (`npm run script -- record-engine-snapshot`); `src/analysis/engine/engineSnapshot.integration.test.ts` proves the plain search still gives exactly this. Never record it again after changing the engine code. |

Two analyses per game since 2026-11-15 (owner's choice): the lite engine grades some moves differently
from the full one (in `lichess-LAGvRNey`, 8... d5 is a mistake with full and good with lite, 8. h3 great
with full and best with lite), and only the full analyses together hold all ten categories.

Build or rebuild one with `npm run fixture:make` after setting `FIXTURE` (`FIXTURE_ENGINE=lite` for the lite files) (see the header of
`scripts/make-fixture.script.ts`). Engine evaluations take minutes. With the same engine, depth and
settings they come out the same on every run (checked by the independent review on 2026-11-15:
identical results on two machines); several tests pin values from `lichess-LAGvRNey`, so rebuild that one with
`REUSE_POSITIONS=1` unless you mean to update those tests.

| Folder | Game | Why it is here |
|---|---|---|
| `lichess-LAGvRNey` | EricRosen (2550) v ni5hu (1761), rapid 10+0, Lichess, 2026-11-04, 1-0 by checkmate | The first fixture. A one-sided game: a great move, one blunder, no brilliant or miss. |
| `lichess-HKl8S22m` | ni5hu (1985) v raphapap (1996), bullet 1+0, Lichess, 2026-11-13, 0-1 on time | Ends on the clock with no mate on the board. Has a miss and two brilliant moves. |
| `lichess-f6WkG3uO` | ni5hu (1753) v HlalVLSI (1676), blitz 3+0, Lichess, 2026-11-13, 1-0 by checkmate | Has a brilliant move and a blunder tagged as throwing the game away. |

The two newer games were picked from 40 recent public games of one account after analysing all of
them with `npm run script -- scan-games`. Between them the three fixtures show all ten move
categories; `src/analysis/fixtures.test.ts` keeps that true.

All games are public games from Lichess, whose game data is released under CC0.
