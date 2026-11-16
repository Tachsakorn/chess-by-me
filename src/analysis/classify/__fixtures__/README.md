# special-moves.json

Seventeen moments from real games, each with real Stockfish output, used to test the special
move categories (Brilliant, Great, Miss) and to check that quiet moves are not upgraded.
Development and test data only; nothing here is shipped to users.

## What is in the file

`engine` records the settings. Each entry of `moments` has:

| Field | Meaning |
|---|---|
| `id` | game, move number with `w`/`b`, and the move |
| `kind` | why the moment was collected: `brilliant-sacrifice`, `only-move`, `missed-win`, `quiet-best` |
| `source.game`, `source.move` | the game and the move in ordinary notation |
| `source.movesFrom` | where the moves of the game were taken from |
| `expected` | the category the move is KNOWN for (its reputation), and on what basis. Written before any engine was run on the moment. It is not what the tests assert: see below |
| `movesBefore` | the moves of the game from the starting position up to the first position of the moment, so the FENs can be re-derived |
| `previous` | only for `missed-win`: the opponent's move just before (its position and the move) |
| `fenBefore`, `moveUci`, `moveSan` | the position and the move played |
| `evals.before`, `evals.after` | engine output for the position before and after the move, in the contract's `PositionEval` shape |
| `evals.previousBefore` | only for `missed-win`: engine output for the position before the opponent's move |

## Engine settings

Stockfish 17.1, full single-threaded build from the `stockfish` npm package
(`node_modules/stockfish/src/stockfish-17.1-single-a496a04.js`), run through Node by
`scripts/eval-positions.mjs`: `go depth 18`, MultiPV 2, default hash, one engine process, one
position at a time, `ucinewgame` before every search so that no result depends on the order of the
moments. Principal variations are cut to 8 plies. `whiteExpected` uses the WintrChess curve
(gradient 0.0035), as `expectedPoints.ts` does.

Run on 2026-11-13: 38 positions in 58 s on the development machine. The script was run twice (first
with 15 moments, then with 17); the engine output of the 15 moments present in both runs was
byte-for-byte identical.

To rebuild: `node scripts/eval-positions.mjs`. The script first replays `movesBefore` and refuses
to run if any position or move does not match.

## Where the games come from

Moves of the seven published games were taken on 2026-11-13 from the wikitext of the English
Wikipedia pages named in `source.movesFrom` (the revision id is given). The main-line moves were
pulled out of the page text by a throwaway script and replayed with chess.js: all seven games
replay legally from the starting position, Byrne vs Fischer ends in checkmate with 41...Rc2#, and
the three diagram FENs printed on the Kasparov vs Topalov page match the replayed positions. The
moves of a chess game are facts; no text from the pages is reproduced beyond short quotations in
`expected.basis`.

| Game | Page |
|---|---|
| Donald Byrne vs Bobby Fischer, New York 1956 | `Game_of_the_Century_(chess)`, revision 1382823337 |
| Garry Kasparov vs Veselin Topalov, Wijk aan Zee 1999 | `Kasparov's_Immortal`, revision 1380728072 |
| Stepan Levitsky vs Frank Marshall, Breslau 1912 | `Levitsky_versus_Marshall`, revision 1358157322 |
| Gersz Rotlewi vs Akiba Rubinstein, Lodz 1907 | `Rotlewi_versus_Rubinstein`, revision 1356335921 |
| Veselin Topalov vs Alexei Shirov, Linares 1998 | `Alexei_Shirov`, revision 1383860105 |
| Magnus Carlsen vs Viswanathan Anand, World Championship 2014, game 6 | `World_Chess_Championship_2014`, revision 1377112266 |
| Veselin Topalov vs Vladimir Kramnik, World Championship 2006, game 2 | `World_Chess_Championship_2006`, revision 1375751263 |

The two online games are already recorded in this repository:

- `lichess-LAGvRNey`: EricRosen vs ni5hu, https://lichess.org/game/LAGvRNey, moves from
  `fixtures/lichess-LAGvRNey/game.json`.
- `chesscom-186299125430`: Sina-Movahed vs Hikaru, https://www.chess.com/game/live/186299125430,
  moves from `src/data/__fixtures__/chesscom-prev-month.json`.

## How the moments were chosen

- The five `brilliant-sacrifice` moments were chosen by reputation alone, before any engine was run:
  each is printed with `!!` on its page.
- `only-move`: 36.Bf1 and 37.Rd7 (Kasparov vs Topalov) are printed with `!!` and described on the
  page as the moves that keep the win; 25...Kb6 is the defence the page shows to be forced;
  48...Kf5 (Topalov vs Shirov) was picked from a shallow engine scan (depth 12) of the game as the
  only move that keeps Shirov's sacrifice working.
- `missed-win`: 26...a4 (Carlsen vs Anand) and 32.Qg6+ (Topalov vs Kramnik) are described on their
  pages as a missed win right after the opponent's blunder. The two moments from the Chess.com blitz
  game have no published annotation; they were picked from the same kind of shallow scan of the
  recorded online games, as the clearest cases of "the opponent blundered and the reply let it go".
- `quiet-best`: quiet, non-capturing moves that were the engine's first choice with a near-equal
  alternative, either in the committed fixture `fixtures/lichess-LAGvRNey/analysis.json` (7.Re1,
  24.Kf2, 33.Ree7) or in the shallow scan (27.Ke2).

The shallow scans were only used to find candidates. Every number stored in the file comes from the
depth-18 run described above.

## What the engine says (as stored)

Scores are centipawns from White's point of view. "Before" for a `missed-win` shows the score before
the opponent's move, then the score before the move itself.

| # | id | kind | move | before | first choice | second choice | move played is | after |
|---|---|---|---|---|---|---|---|---|
| 1 | `byrne-fischer-1956-17b-Be6` | brilliant-sacrifice | 17...Be6 | -202 | Be6 -202 | Nb5 +59 | first | -202 |
| 2 | `kasparov-topalov-1999-24w-Rxd4` | brilliant-sacrifice | 24.Rxd4 | -37 | Rxd4 -37 | Nc6+ -97 | first | -30 |
| 3 | `levitsky-marshall-1912-23b-Qg3` | brilliant-sacrifice | 23...Qg3 | -504 | Qg3 -504 | Qb2 -439 | first | -511 |
| 4 | `topalov-shirov-1998-47b-Bh3` | brilliant-sacrifice | 47...Bh3 | -151 | Bh3 -151 | Be4 -103 | first | -448 |
| 5 | `rotlewi-rubinstein-1907-22b-Rxc3` | brilliant-sacrifice | 22...Rxc3 | -552 | Rxc3 -552 | Qe7 -318 | first | -562 |
| 6 | `kasparov-topalov-1999-36w-Bf1` | only-move | 36.Bf1 | +182 | Bf1 +182 | Qa3 -562 | first | +184 |
| 7 | `kasparov-topalov-1999-37w-Rd7` | only-move | 37.Rd7 | +236 | Rd7 +236 | Bxc4 -11 | first | +232 |
| 8 | `topalov-shirov-1998-48b-Kf5` | only-move | 48...Kf5 | -377 | Kf5 -377 | f5 -61 | first | -540 |
| 9 | `kasparov-topalov-1999-25b-Kb6` | only-move | 25...Kb6 | +83 | Kb6 +83 | Kb8 +342 | first | +154 |
| 10 | `carlsen-anand-2014-g6-26b-a4` | missed-win | 26...a4 (after Kd2) | +32 / -188 | Nxe5 -188 | Ka6 +52 | neither | +49 |
| 11 | `topalov-kramnik-2006-g2-32w-Qg6` | missed-win | 32.Qg6+ (after Bxf8) | +0 / +618 | Rxg4+ +618 | Qg6+ +103 | second | +94 |
| 12 | `chesscom-186299125430-61w-h5` | missed-win | 61.h5 (after Ra5) | +51 / +374 | g5 +374 | Rd2+ +332 | neither | +43 |
| 13 | `chesscom-186299125430-93w-Qe8` | missed-win | 93.Qe8 (after Kb7) | +0 / +489 | Qg2+ +489 | Qg7 +487 | neither | +0 |
| 14 | `lichess-LAGvRNey-7w-Re1` | quiet-best | 7.Re1 | +30 | Re1 +30 | Bf4 -6 | first | +14 |
| 15 | `lichess-LAGvRNey-24w-Kf2` | quiet-best | 24.Kf2 | +372 | g4 +372 | Kf2 +355 | second | +343 |
| 16 | `lichess-LAGvRNey-33w-Ree7` | quiet-best | 33.Ree7 | +320 | Rb7 +320 | Rc7 +320 | neither | +338 |
| 17 | `carlsen-anand-2014-g6-27w-Ke2` | quiet-best | 27.Ke2 | +49 | Ke2 +49 | Ke1 +37 | first | +48 |

Where the engine and the reputation part ways, already visible in this table:

- 2, Kasparov's 24.Rxd4: the engine's first choice, but it scores the position as slightly worse for
  White both before (-0.37) and after (-0.30). At depth 18 the engine does not see a winning
  sacrifice here, only the best move in a slightly worse position.
- 3 and 5, Marshall's 23...Qg3 and Rubinstein's 22...Rxc3: first choices, but Black is already winning
  by five pawns or more and the second choice wins as well.
- 9, Topalov's 25...Kb6: the first choice and far better than the alternative, but after it the engine
  prefers White (+1.54).
- 15 and 16: two of the quiet moves are not the engine's first choice in this run, although they were
  in the committed fixture of the same game (that run did not clear the hash between positions).
  They are kept; 14 and 17 are the quiet moves that are first choices.

`expected` in the file is left as the reputation. The category the classification method gives each
moment is pinned in `../specialMoves.test.ts` and listed in `docs/sources/classification.md`.
