# Sources: move classification (`src/analysis/classify`)

Accessed 2026-11-13.

## What was taken from where

| Source | Licence | Version | What was taken |
|---|---|---|---|
| WintrChess, https://github.com/WintrCat/wintrchess | GPL-3.0 | commit `d145b20968955ca955cafe3fc3b51305f3bf41f9` (2026-02-03) | The method: formulas, thresholds, piece values, the order of the rules. **No code was copied**; everything is written again for this project's types (FEN strings and the contract's `Score`). Each file header names the WintrChess file it follows. |
| lichess-org/chess-openings, https://github.com/lichess-org/chess-openings | CC0-1.0 | commit `3ba6b20d31b2e6125cb0e6a2e792f400717d9d39` (2026-11-05) | `a.tsv` to `e.tsv`: ECO code, name and moves of 3865 opening positions. |
| English Wikipedia (seven game pages, listed in `src/analysis/classify/__fixtures__/README.md`) | text CC BY-SA; the moves of a game are facts | revision ids in the README | The moves of seven published games, for test fixtures only. |
| Chess.com announcement "New Classification System in Game Review", https://www.chess.com/announcements/view/new-classification-system-in-game-review | n/a | read only as quoted in a web search result; the page itself is behind a login and was **not opened** | The idea of Miss: a move that is bad because it fails to punish the opponent's bad move, not because the mover's own position went wrong. No numbers were taken. |
| Chess.com Help Center, "How are moves classified?", https://support.chess.com/en/articles/8572705 | n/a (facts) | page dated 2026-02-09, read 2026-11-17 | The three error lines of the ladder: Inaccuracy from 0.05, Mistake from 0.10, Blunder from 0.20 expected points lost (since 2026-11-17, see "The ladder"). Numbers only; no code. |

Nothing from Chesskit or lila (both AGPL-3.0) was read or copied.

WintrChess files read, all under `shared/src/`: `constants/Classification.ts`, `constants/utils.ts`,
`constants/PieceColour.ts`, `lib/utils/chess.ts`, `lib/reporter/expectedPoints.ts`, `classify.ts`,
`report.ts`, `classification/pointLoss.ts`, `classification/brilliant.ts`,
`classification/critical.ts`, `utils/criticalMove.ts`, `utils/pieceSafety.ts`, `utils/attackers.ts`,
`utils/defenders.ts`, `utils/dangerLevels.ts`, `utils/pieceTrapped.ts`, `utils/opening.ts`,
`utils/extractNode.ts`, `types/*`; and `client/src/apps/features/analysis/lib/engine.ts` and
`evaluate.ts` (to see what the engine reports for a finished game). Line numbers below refer to
these files at that commit.

## Names

`constants/Classification.ts` lines 1-13 lists eleven classes.

| WintrChess | Ours | Notes |
|---|---|---|
| `brilliant` | `brilliant` | tag `sacrifice` |
| `critical` | `great` | tag `only-good-move` |
| `best` | `best` | |
| `excellent` | `excellent` | |
| `okay` | `good` | |
| `inaccuracy` | `inaccuracy` | |
| `mistake` | `mistake` | |
| `blunder` | `blunder` | |
| `theory` | `book` | matched differently, see "Opening book" |
| `forced` | `best` with tag `forced` | |
| `risky` | none | In the enum (line 12) but `classify.ts` never returns it at this commit. |
| (none) | `miss` | **WintrChess has no Miss class.** Ours is defined under "Miss". |

`classifValues` (lines 15-27) ranks the classes; `classify.ts` uses it only to ask "is this move
at least Best?" before considering Brilliant.

## Expected points

`lib/reporter/expectedPoints.ts`:

- Line 14: `centipawnGradient: 0.0035` (the default; it is an option there, we use the default).
- Lines 25-27: expected points for White = `1 / (1 + e^(-0.0035 * centipawns))`.
- Lines 18-23: a mate score is 1 for the side that mates and 0 for the other. A "mate in 0" (the
  game is over) goes to the side that just moved.
- Lines 31-45: loss = `max(0, before - after)` from the mover's side.

Ours (`expectedPoints.ts`): the same curve and constant. `mate` is 1 or 0 by `winner`; `over` is 1,
0 or 0.5 by `winner`. Pinned values: +100 cp = 0.5866, +300 cp = 0.7408.

How WintrChess sees a finished game: its engine wrapper stops at a line containing `depth 0`
(`client/.../lib/engine.ts` line 137), which is what Stockfish prints for a position with no legal
moves (`score mate 0` for checkmate, `score cp 0` for stalemate). So the contract's
`{ kind: 'over', winner }` is treated as "mate in 0 for the winner" and `{ kind: 'over', winner: null }`
as 0 centipawns. The contract also uses `over` for other drawn endings; they are treated the same.

## Order of decisions

`lib/reporter/classify.ts`, with defaults `includeBrilliant`, `includeCritical`, `includeTheory` all
true (lines 29-34):

| # | WintrChess | Line | Ours (`classifyGame.ts`, `classifyMove`) |
|---|---|---|---|
| 1 | one legal move or none: `forced` | 37 | **book first** (see below), then one legal move: `best` + `forced` |
| 2 | position after the move is in the opening list: `theory` | 42-46 | moves up to `opening.lastBookPly`: `book`, unless the move is a real mistake (difference 16) |
| 3 | position after the move is checkmate: `best` | 49 | same |
| 4 | played move is the engine's first move: `best`, otherwise the ladder | 53-58 | same (moves compared by UCI, not SAN) |
| 5 | first move played and `critical` conditions hold: `critical` | 61-65 | `great` |
| 6 | class is at least Best and `brilliant` conditions hold: `brilliant` | 67-71 | `brilliant` |
| 7 | (none) | | Miss, then tags |

Book comes before forced here because the contract's validator requires `book` for exactly the
moves up to `opening.lastBookPly`, apart from the ones listed in `opening.errorPlies` (difference 16).

Step 6 also applies to a move that is not the engine's first choice but that the ladder calls
Best (loss under 0.01): such a move can be Brilliant, never Great.

## The ladder

`lib/reporter/classification/pointLoss.ts`. "Subjective" means from the mover's side.

Both scores in centipawns (lines 96-108), on the expected points lost. **Since 2026-11-17 the
three error lines are Chess.com's, not WintrChess's** (see "Error lines from Chess.com" below):

| Loss | Class | Ours from 2026-11-17 | WintrChess (ours until 2026-11-16) | WintrChess line |
|---|---|---|---|---|
| below the Excellent line | best | < 0.01 | < 0.01 | 96 |
| | excellent | < 0.045 | < 0.045 | 98 |
| | good (`okay`) | < **0.05** | < 0.08 | 100 |
| | inaccuracy | < **0.10** | < 0.12 | 102 |
| | mistake | < **0.20** | < 0.22 | 104 |
| otherwise | blunder | from 0.20 | from 0.22 | 106 |

### Error lines from Chess.com (owner, 2026-11-17, 1.1 round 4)

- Source: Chess.com Help Center, "How are moves classified? What is a 'blunder' or 'brilliant,'
  etc.?", https://support.chess.com/en/articles/8572705, page dated 2026-02-09, read again
  2026-11-17. Its table of expected points lost: Best 0.00, Excellent 0.00-0.02, Good 0.02-0.05,
  Inaccuracy 0.05-0.10, Mistake 0.10-0.20, Blunder 0.20-1.00.
- Taken: the three numbers 0.05, 0.10 and 0.20, published facts. **No code** was taken from
  Chess.com (none is published). The curve that turns an evaluation into expected points stays
  WintrChess's (above); Chess.com says its own curve also depends on the players' ratings, which
  is not published and not used here.
- Why: on 23 games compared with Chess.com Game Review (branch `analysis/chesscom-compare`), the
  app called fewer moves errors than Chess.com in every rating group.
- Excellent: Chess.com's 0.02 was tried against keeping 0.045, on the same 23 games (same engine
  evaluations), and only those two. Chess.com's summary pages: Excellent 381, Good 156. Keeping
  0.045: 347 and 46. With 0.02: 139 and 254. Kept 0.045 (off by 34 + 110 = 144 against
  98 + 225 = 323). Both give the same Excellent + Good together (393), since only the line between
  them moves. 0.045 is below 0.05, so Good still has a band (0.045 to 0.05), a narrow one.
- Best stays 0.01 (Chess.com's Best is the engine's move itself; not part of this change).
- `RULES_VERSION` went from 5 to 6, so analyses saved before are made again, one game at a time
  when that game is opened (`ReviewScreen`, `isCurrentAnalysis`).

Mate before and mate after (lines 26-53):

| Case | Class | Line |
|---|---|---|
| mover had the mate, now the opponent has it, mate in more than 3 | mistake | 32-33 |
| same, mate in 3 or fewer | blunder | 34 |
| `mateLoss` = change in the subjective mate count; `mateLoss < 0`, or `0` for the side being mated | best | 39-45 |
| `mateLoss < 2` | excellent | 46 |
| `mateLoss < 7` | good | 48 |
| otherwise | inaccuracy | 50 |

So mate in 2 becoming mate in 6 for the mover is `good`, never an error.

Mate for the mover before, centipawns after (lines 56-71), on the subjective centipawns left:
`>= 800` excellent, `>= 400` good, `>= 200` inaccuracy, `>= 0` mistake, below 0 blunder.

Centipawns before, mate after (lines 74-87): mate for the mover: best; mate against in 2 or fewer:
blunder; in 5 or fewer: mistake; longer: inaccuracy.

`categoryForLoss(pointLoss)` is the first table; `categoryByRules(before, after, mover)` is all four,
except that it never gives a milder class than the first table gives for the same loss (difference
13, since 2026-11-15).

## Great (WintrChess "critical")

`utils/criticalMove.ts`, the first test for both Great and Brilliant (`isCriticalCandidate`):

- Lines 20-30: not when the second line still leaves the mover at `>= 700` centipawns; with no
  second line, not when the score after the move is `>= 700` centipawns for the mover. A second line
  that is a mate score does not rule the move out.
- Line 33: not when the mover is worse after the move (subjective value below 0, which includes
  being mated).
- Line 36: not a queen promotion.
- Line 39: not when the mover was in check.

`classification/critical.ts` (`isGreat`), for the engine's first choice only:

- Lines 18-21: not when the move leaves the mover with a forced mate.
- Lines 24-35: not a capture of a piece that was not safe (free material). The piece looked at is
  the one actually removed, also for en passant.
- Line 37: needs a second engine line. **With one line Great is never awarded.**
- Lines 39-46: the second line must lose at least `0.1` expected points against the first.

## Brilliant

`classification/brilliant.ts` (`isBrilliant`):

- Line 20: must pass the candidate test above (so: never when completely winning anyway, never
  when still worse afterwards). **Changed here** (owner, 2026-11-15; difference 9 below): for
  Brilliant, "still worse" means expected points below 0.455 for the mover, not below 0.
- Line 23: not a promotion (any piece).
- Lines 25-34: the mover's unsafe pieces before the move, and after it (after it, pieces worth no
  more than what the move captured are left out: `pieceSafety.ts` lines 73-80; this is what keeps
  recaptures and even trades from being Brilliant).
- Lines 38-41: not when the move does not give check and fewer pieces are unsafe than before
  (a piece was moved to safety).
- Lines 44-52: not when every unsafe piece is covered by a counter-threat ("danger levels"), or
  when there is none.
- Lines 54-70: not when all unsafe pieces are trapped, or the piece that moved was trapped
  before, or fewer pieces are trapped than before.
- Line 72: otherwise Brilliant when at least one piece is unsafe.

Piece values, `constants/utils.ts` lines 58-65: pawn 1, knight 3, bishop 3, rook 5, queen 9, king
infinite.

`utils/pieceSafety.ts`, `isPieceSafe` (ours: `isPieceSafe`):

| Rule | Line |
|---|---|
| a rook that just captured a minor piece, attacked by exactly one piece which is a minor piece, with at least one defender: safe | 24-31 |
| a direct attacker worth less than the piece: unsafe | 34-38 |
| attackers (batteries included) no more than defenders: safe | 41-43 |
| piece worth less than its cheapest direct attacker and some defender worth less than that attacker: safe | 47-58 |
| some defender is a pawn: safe | 61-63 |
| otherwise unsafe | 65 |

`getUnsafePieces` (lines 68-83): pieces of one colour that are not pawns or kings, worth more
than what the played move captured, and not safe.

`utils/attackers.ts`: an attacker is a piece with a **legal** capture on the square (lines 15-30;
a piece pinned to its king does not count), plus the king next to the square even when capturing
would be illegal (lines 32-48), plus pieces revealed when an attacker is lifted off the board,
repeated (lines 53-112; nothing is revealed behind a king, line 79).

`utils/defenders.ts`: for each direct attacker, play the capture and count the pieces that can
legally recapture (batteries included); the smallest such set is the defenders (lines 16-46). With
no attacker, a piece of the other colour is imagined on the square and its attackers are counted
(lines 50-60). So a defender pinned to its king does not count either.

`utils/dangerLevels.ts`: after a move that acts on a threatened piece, the side that made it is
"under a greater threat" when it has an unsafe piece worth at least as much as the threatened one
(other than on the threatened square), or when the threatened piece is worth less than a queen and
the opponent can mate in one (lines 16-31, 86-117; "creates" variant with only the new attacks,
lines 39-84). `utils/pieceTrapped.ts` lines 15-53: a piece is trapped when it is unsafe where it
stands and every move of it either creates a greater threat or lands on a square where it is
unsafe.

### Signatures settled on

```ts
// attackers.ts
getAttackers(fen: string, square: Square, by: Color, options?: { xray?: boolean }): Array<{ square: Square; piece: PieceSymbol }>
getDefenders(fen: string, square: Square, options?: { xray?: boolean }): Array<{ square: Square; piece: PieceSymbol }>
// pieceSafety.ts
isPieceSafe(fen: string, square: Square, playedMove?: { captured?: PieceSymbol }): boolean
getUnsafePieces(fen: string, color: Color, playedMove?: { captured?: PieceSymbol }): Array<{ square: Square; piece: PieceSymbol }>
// dangerLevels.ts, pieceTrapped.ts
moveLeavesGreaterThreat(fen, threatened, acting): boolean
moveCreatesGreaterThreat(fen, threatened, acting): boolean
isPieceTrapped(fen: string, square: Square): boolean
```

`Color` is the contract's (`'white' | 'black'`); `Square` and `PieceSymbol` are chess.js's.
`xray` defaults to true (batteries counted). The side to move in `fen` does not matter for these,
except `moveLeavesGreaterThreat` and `moveCreatesGreaterThreat`, where the acting move must be
legal for the side to move.

## Opening book

`scripts/build-openings.mjs` downloads `a.tsv` to `e.tsv` at the commit above, replays each row
with chess.js and writes `src/analysis/classify/openings.json`: 3865 positions keyed by EPD (the
first four FEN fields, spelled as chess.js spells them), value `[eco, name]`. No two rows give
the same position. 527352 bytes on disk (formatted so that Prettier leaves it alone), 464201 bytes
minified. Every one of the 20 possible first moves is a named position.

`findOpening` returns the name and code of the highest ply whose position is in the list, and
that ply as `lastBookPly`. Transpositions are recognised. A FEN that names the en passant square
after every double step is respelled through chess.js before the lookup.

WintrChess (`utils/opening.ts` lines 1-10) keys its own list by piece placement only and asks
move by move whether the position after the move is listed. Here every move up to the last listed
position is `book`, also a move that left the list for a moment, because that is what the
contract defines. Since 2026-11-15 one exception: a book move that is a real mistake keeps the label
(difference 16).

## Moves the reader tries (this project's own, owner 2026-11-16)

`src/analysis/tryMove.ts`. A move tried on the review board gets its label from `reviewMove`, the
function that labels the moves of the game: no rule is added, changed or left out. The line is laid
end to end with the game it left, so the first tried move is measured against the game analysis's
evaluation of the position before it (and against the game's previous moves, for Miss and for the
repeated-sacrifice rule of Brilliant), and each later move against the line's own evaluations.

- Book: a tried move is `book` when the position it reaches is in the opening book (the same
  `openings.json`, by position, so transpositions count), with the same exception for a real
  Mistake or Blunder (difference 16). Unlike a finished game, a line grows move by move; the label
  of a move is decided from the line up to that move only, so a label once shown does not change
  when more moves are tried.
- "Better than / As good as / Worse than the game move" (`compareWithGameMove`) is this project's
  own: the mover's expected points after the tried move against those after the move played in
  the game, `same` (shown as "As good as the game move", owner 2026-11-16: a different move can
  earn it) when they differ by less than 0.01, the floor below which the labels treat a loss as
  nothing (`ERROR_MIN_LOSS`). Not taken from WintrChess or anywhere else.
- Nothing of a tried line is kept or counted: the game's analysis, accuracies and labels are not
  touched. The contract is unchanged.

## Miss (this project's own rule)

WintrChess has no Miss. The brief asks for the category under the name Chess.com uses; the only
description found (see the first table) says a Miss is a move that fails to punish the
opponent's bad move. A move is `miss` when all five hold (`miss.ts`, `classifyMove`):

1. By the ladder above the move is a `mistake` or a `blunder` (so it is not the engine's first
   choice).
2. The opponent's previous move was a `mistake` or a `blunder` by the same ladder. A book move, a
   forced move and the engine's first choice are never errors for this purpose.
3. Before the move the mover had at least `0.62` expected points (or a forced mate): a clear
   advantage was on offer. `0.62` is a level game (0.5) plus WintrChess's mistake threshold
   (0.12), about +140 centipawns. A number of its own: unchanged when the ladder's Mistake line
   moved to 0.10 (2026-11-17).
4. Over the two moves together the mover lost less than `0.08` expected points: (mover's expected
   points before the opponent's move) minus (after the mover's reply) `< 0.08`. `0.08` is where
   WintrChess's `inaccuracy` starts; a number of its own, unchanged when the ladder's Inaccuracy
   line moved to 0.05 (2026-11-17). If the reply loses more than that, it gave away more than it was
   given and stays a mistake or blunder.
5. After the move the mover is still at least equal: `0.455` expected points or more
   (`MISS_MIN_EXPECTED_AFTER` = `AT_LEAST_EQUAL_EXPECTED`, the floor of a Brilliant move). Added
   2026-11-15 (Fable review A1-04): when both sides trade blunders, a reply that leaves the mover
   lost was a Miss because "nothing was lost overall"; it is now a mistake or blunder.

**A missed short mate** (owner, 2026-11-15; difference 12 below) is a Miss on its own, whatever
the opponent did before: the mover had a forced mate in 3 or less (`MISSED_MATE_MAX`), the move
keeps no forced mate, and the mover still has at least `0.72` expected points afterwards
(`STILL_AHEAD_EXPECTED`, the other side of `LOSING_EXPECTED` 0.28).

Every Miss, both kinds, must also cost at least 1% (difference 11).

A Miss carries the tag `missed-mate` when the mover had a forced mate before the move, otherwise
`missed-win`. The first move of a game is never a Miss. The two numbers are choices made here, not
taken from any source; they were fixed before the real moments were classified (rule 3 was set at
0.62 rather than a stricter "winning" level so that a missed chance from a worse position, as in
Carlsen vs Anand below, can count).

## Tags (this project's own; WintrChess has none)

Listed in this order when several apply.

| Tag | Exactly when |
|---|---|
| `sacrifice` | the category is `brilliant` |
| `only-good-move` | the Great conditions hold. A move that is both Great and Brilliant is shown as `brilliant` with both tags |
| `forced` | the position had one legal move (category `best`; not given to book moves) |
| `missed-mate` | the move is not the engine's first choice, the score before it was a forced mate for the mover, and the score after it is not. Given whatever the category (WintrChess's ladder calls mate -> +900 `excellent`) |
| `missed-win` | the category is `miss` and the mover did not have a forced mate |
| `allows-mate` | the move is not the engine's first choice, the score after it is a forced mate for the opponent, and the score before it was not |
| `throws-away-advantage` | the category is `mistake` or `blunder` (never `miss`), the mover had at least `0.455` expected points before the move, and has at most `0.28` after it |

`throws-away-advantage` in words: the mover was at least equal and is now losing. "At least
equal" is no more than an excellent move's worth (0.045) below a level game, about -52 centipawns
or better. "Losing" is WintrChess's blunder line (0.22) below a level game, about -270 centipawns
or worse, or any forced mate against the mover. Both numbers are choices made here, built from
the ladder's thresholds of the time; they are numbers of their own and stayed when the error
lines moved (2026-11-17).

No tag is given to book moves, to a checkmating move, or to the engine's first choice other than
`sacrifice` and `only-good-move`.

`pointLoss` in the result is 0 for the engine's first choice, a forced move and a checkmating
move, and otherwise the expected points lost between the two evaluations (0..1). WintrChess has no
such field.

## Where this deliberately differs from WintrChess

1. **Book**: by position with castling and en passant rights (EPD) from Lichess's list, every move
   up to the last listed position, and decided before `forced`. Reason: the contract. Except a book
   move that is a real mistake (difference 16).
2. **Miss** exists (see above).
3. **The mover was being mated and the next score is in centipawns**: `best`. WintrChess grades
   this on the centipawn score alone (lines 56-71 do not ask whose mate it was), which would call
   escaping a mate while still far behind a `blunder`. Nothing was given up, so it is `best` here.
4. **The mover was being mated and now has a forced mate**: `best`. WintrChess counts the mate
   distance across the change of sign and marks the move down (lines 39-52).
5. **A pawn that captures with promotion is one attacker**, tried as a queen promotion. WintrChess
   lists the four promotion moves as four attackers (`attackers.ts` lines 27-30 keep every move).
6. **Batteries**: a piece counts as revealed when it attacks after the front piece is lifted and
   did not before. WintrChess takes the symmetric difference of the two lists (`xorWith`, lines
   88-96), which would also count an attacker that disappears when the front piece is lifted. By
   reasoning that should not happen in a legal position (a front piece that can legally capture is
   not pinned by another piece), but this was not tested against WintrChess's code.
7. **Speed**: instead of generating every move of the position, each piece that eyes the square is
   tested for a legal capture, and answers are remembered (bounded caches in `attackers.ts` and
   `pieceSafety.ts`). The result is the same; see "Checked" below.
8. `pointLoss` and the tags are additions, as described above.
9. **Brilliant may leave the mover a little worse** (owner, 2026-11-15). WintrChess rules out
   Great and Brilliant whenever the mover's score after the move is below 0 (`criticalMove.ts`
   line 33). Here that stays for Great, but for Brilliant only expected points below
   `AT_LEAST_EQUAL_EXPECTED` = 0.455 (about -52 cp; `expectedPoints.ts`) count as worse. A forced
   mate against the mover still rules it out.
   - Why: a sacrifice that leaves the game level often scores a few centipawns either side of 0,
     so the label fell to engine noise. The owner's example, a French Exchange game, 9.Qd2 leaving
     the g5 bishop to ...hxg5 to open the h-file (Chess.com: Brilliant): -19 cp after the move with
     the lite engine and -24 with the full one at depth 18; the full engine at depth 26 gives -1.
     Pinned in `brilliant.test.ts`.
   - Why 0.455: it is this project's existing line for "at least equal" (an Excellent move's worth,
     0.045, below a level game), so no new constant was invented. The owner turned down 0.40
     (about -116 cp) as too loose.
   - Effect on the famous moments below: Kasparov vs Topalov 1999, 24.Rxd4 becomes Brilliant.
   - Measured on real games before the change was adopted: see "Brilliant floor: measured" below.
   - Agrees with Chess.com's own description: "You should not be in a bad position after a
     Brilliant move" (Chess.com Support, "How are moves classified? What is a 'blunder' or
     'brilliant,' etc.?", https://support.chess.com/en/articles/8572705, page dated 2026-02-09,
     read 2026-11-15). A little worse is not a bad position; "below 0" was stricter than that.
10. **A sacrifice counts once** (owner, 2026-11-15). WintrChess judges each move on its own, so
    leaving the same piece hanging on the next move again is a second Brilliant. Here a piece left
    to be taken does not make a move Brilliant when, after the mover's own previous move, that
    piece already stood on the same square, was already unsafe, and at least one of the enemy
    pieces attacking it then still attacks it now (`brilliant.ts` `leftAlready`). The move is
    Brilliant only when at least one piece is newly left. `classifyGame` passes the mover's
    previous move (`ownPrevious`, two plies back) for this; without it nothing changes.
    - Why: in the French Exchange game, 9.Qd2 leaves the g5 bishop to ...hxg5 and 9...Re8 declines;
      10.O-O-O leaves the same bishop to the same pawn and was a second Brilliant for one sacrifice.
      Pinned in `brilliant.test.ts` (9.Qd2 Brilliant, 10.O-O-O not) and `classifyGame.test.ts`.
    - A piece left to a new attacker, or moved and left again elsewhere, still counts as new.
11. **An error must cost at least 1%** (owner, 2026-11-15). A move graded Inaccuracy, Mistake, Miss
    or Blunder that costs the mover less than `0.01` expected points (`ERROR_MIN_LOSS`, the
    ladder's step from Best) is `good` instead. Its tags stay (`allows-mate` for example).
    - Why: the mate rules of the ladder (`categoryByRules`) grade by the number of moves to mate
      alone, from WintrChess, and never look at the win chance. In a game already decided they
      called moves errors that changed nothing: 34...Bg7 in `lichess-f6WkG3uO` (lite) let White
      mate in 3 when Black was at -18 and had 0.18% (Mistake, "+18.0 → #3, Win chance dropped 0%");
      a losing side whose mate came sooner, or a winning side whose mate came later, was an
      Inaccuracy. Good, not Best: the engine had a better move, and Good has no badge in the move
      lists.
    - Measured on 119 real games (6,474 moves, lite, depth 18): exactly 42 moves changed, all to
      Good (Inaccuracy 32, Mistake 5, Blunder 5); in all 42 the mover was below 5% or above 95%
      before the move.
12. **Missing a short mate is a Miss** (owner, 2026-11-15): see "Miss" above. Before this, a
    forced mate let go while still ahead +8 or more was Excellent (+4 Good, +2 Inaccuracy) and a
    Miss needed an error by the opponent first; 28...Qxg1+ in `lichess-HKl8S22m` (mate in 1 with
    28...Qxh4#, still -8.8 after) was Excellent.
    - Measured on the same 119 games: 7 moves became Miss (2 from Excellent, 3 from Good, 2 from
      Inaccuracy). Two more missed short mates cost under 1% (32...Be7+ and 38...Rc5+, still above
      99%) and stay Excellent by rule 11. All other moves kept their labels.
    - The Move panel says "Missed mate in N." / "พลาดรุกจนใน N ตา" for any Miss that let a forced
      mate go, and never "Win chance dropped 0%": under 1% it says "Already lost..." (mover below
      5% before), "Still winning." (above 95%) or "Win chance held" (`src/ui/review/panel.ts`).

13. **A mate rule never gives a milder label than the ladder** (Fable review A1-01, 2026-11-15).
    WintrChess grades a move with a mate score on either side by the mate tables alone. Those tables
    look at the number of moves to mate, never at the win chance, so a move that threw the game
    away could get a mild label: letting a mate in 1 go to +2.5 was an Inaccuracy (29% of the win
    chance gone), allowing a mate in 8 from +8.0 an Inaccuracy (94% gone), stalemating instead of
    mating a Mistake (50% gone). `categoryByRules` now takes the harsher of the mate table and the
    plain point-loss ladder. The tables can still make a label harsher (a side already lost that
    walks into a quicker mate). Rule 11 still turns an "error" that costs under 1% into Good.
14. **Labels while analysing are the final labels** (Fable review A1-02, 2026-11-15). The review
    streamed move by move did not know the mover's previous move, so 10.O-O-O of the French
    Exchange game above showed Brilliant while analysing and Best at the end. Both now take their
    input from `moveInputAt` (`classifyGame.ts`). In the 119 games below it affected 1 move
    (10.O-O-O of one Chess.com game).
15. **Rules version.** Every analysis keeps the version of these rules (`rulesVersion` in the
    contract, `RULES_VERSION` in `classify/index.ts`, now 5: 3 was the speed round, 4 and 5
    are difference 16). A saved analysis from older rules is analysed again when its game is opened.
    Raise the number with every change here that can change a label.
16. **A book move that is a real mistake is labelled as that mistake** (owner, 2026-11-15, Fable
    review A1-05). Lichess's opening list names trap lines and dubious gambits, so their losing moves
    were Book: in Fool's mate (1.f3 e5 2.g4 Qh4#) 2.g4 was Book although it allows mate in one. Now
    a move up to `lastBookPly` keeps the ladder's Mistake or Blunder when the ladder gives one and
    the move costs at least 1% (rule 11's floor); otherwise it stays Book. A book move the ladder
    calls only an Inaccuracy stays Book: sound gambits such as the King's Gambit lose a little by
    the engine and should not be marked (owner, same day, after a first version that also took
    Inaccuracy: rules version 4, never released). The engine's first choice and the only legal move
    always stay Book. Such a move gets the tags an error gets (`allows-mate`,
    `throws-away-advantage`, ...) but never Miss, which is about the opponent's previous move; it
    does count as the opponent's error for the next move's Miss. Code: `bookError` in
    `classifyGame.ts`. The contract got an optional field, `opening.errorPlies`, listing these
    plies (left out when there are none); the validator requires `book` for every other move up
    to `lastBookPly` and an Inaccuracy, Mistake or Blunder for the listed ones (it still accepts
    Inaccuracy, so the contract did not change again). Old analyses without the field are valid as
    before. `lastBookPly` and the opening's name do not change, so the name can come from a
    position after the mistake. The move lists show Book on the first and last move that is still
    labelled Book (`bookRange`), so the last Book badge can sit before the mistake.
    - Measured on the same 119 games (6,474 moves, scores kept from the speed round's run, no new
      engine run): exactly 3 moves changed, all from Book (753 → 750 Book moves): 2.Nf3 in the
      Englund Gambit Declined, Reversed Krebs (Mistake, 12.9%), 3.Nxe5 in the Schulze-Müller Gambit
      (Blunder, 22.2%) and 2.Nf3 in the Tennison Gambit (fixture `lichess-HKl8S22m`, Mistake,
      13.9%). No other move changed (no knock-on Miss), and no player's accuracy changed. In the
      Tennison game the mistake is the last book move, so the last Book badge moves to 1...d5; in the
      other two the mistake sits inside the book and the Book badges stay where they were. The first
      version (Inaccuracy too) changed 13 moves, 10 of them Inaccuracies in gambits such as 2.f4 of
      the King's Gambit (8.3%). Lite engine at depth 18: these are the app's numbers, not a deeper
      verdict on the gambits.

Measured for 13 and the Miss floor (rule 5 of "Miss") together, on the same 119 games (6,474
moves, Stockfish 17.1 lite, depth 18, scores kept from the earlier run): 47 moves changed.
Miss → Blunder 18, Mistake → Blunder 17, Inaccuracy → Blunder 3, Excellent → Good 3,
Good → Inaccuracy 3, Inaccuracy → Mistake 1, Inaccuracy → Miss 1, Miss → Mistake 1. In every
change the label became harsher or became a Miss; none became milder.

## Brilliant floor: measured (difference 9)

Before adopting the 0.455 floor (owner, 2026-11-15), the app's own analysis (`analyzeGame`,
Stockfish 17.1 lite, depth 18, two lines, no cloud eval) was run over 119 real games, 6,474
moves: 116 recent games of the owner's own accounts (53 Lichess, 63 Chess.com) and the three
fixtures. Each Brilliant move under the new rule was checked against the old rule (`isCriticalCandidate`
with no floor). Scripts and data stayed outside the repository.

| | games | Brilliant, old rule | Brilliant, new rule |
|---|---|---|---|
| Lichess | 53 | 8 | 8 |
| Chess.com | 63 | 5 | 7 |
| fixtures | 3 | 3 | 3 |
| **all** | **119** | **16 (0.134 a game)** | **18 (0.151 a game)** |

The owner's limit was one Brilliant in five games (0.2 a game); the new rule stays under it.
Both new Brilliants are in the French Exchange game: 9.Qd2 (the move that started this) and
10.O-O-O, which leaves the same g5 bishop to ...hxg5 a second time (Black played 9...Re8). Both
scored -19 / -21 cp for White after the move (expected 0.483 / 0.482).

The owner then asked for a sacrifice to count once (difference 10). The same 119 stored analyses
were classified again with it (no new engine run): **17 Brilliant (0.143 a game)**. Of 6,474 moves
exactly one changed, 10.O-O-O, from `brilliant` to `best`; 9.Qd2 stays Brilliant.

One sample of one player's games plus three others: it says the rule does not flood the label,
not how often Brilliant appears for players in general.

## The real moments: what the method gives

`src/analysis/classify/__fixtures__/special-moves.json` (Stockfish 17.1 full, depth 18, two lines).
"Known as" is the move's reputation; "Method" is what `classifyMove` returns, pinned in
`specialMoves.test.ts`.

| Moment | Known as | Method | Why |
|---|---|---|---|
| Byrne vs Fischer 1956, 17...Be6 | brilliant | **brilliant** (`sacrifice`, `only-good-move`) | first choice; second choice gives up 0.22; queen and knight stay en prise |
| Kasparov vs Topalov 1999, 24.Rxd4 | brilliant | **brilliant** (`sacrifice`) | first choice; the engine has White slightly worse afterwards (-30, expected 0.474), which Brilliant allows since 2026-11-15 (difference 9); it was **best** before |
| Levitsky vs Marshall 1912, 23...Qg3 | brilliant | **best** | first choice; before it queen and rook were both en prise, after it only the queen (the g-pawn is pinned): fewer hanging pieces counts as a piece moved to safety. Second choice gives up only 0.03 |
| Topalov vs Shirov 1998, 47...Bh3 | brilliant | **brilliant** (`sacrifice`) | first choice; the bishop can be taken; second choice gives up only 0.04 |
| Rotlewi vs Rubinstein 1907, 22...Rxc3 | brilliant | **brilliant** (`sacrifice`, `only-good-move`) | first choice; the knight taken was defended; second choice gives up 0.12; queen and rook stay en prise |
| Kasparov vs Topalov 1999, 36.Bf1 | only move | **brilliant** (`sacrifice`, `only-good-move`) | first choice; second choice gives up 0.53; the bishop is left to the queen |
| Kasparov vs Topalov 1999, 37.Rd7 | only move | **great** (`only-good-move`) | first choice; second choice gives up 0.21; the pieces left en prise are covered by counter-threats |
| Topalov vs Shirov 1998, 48...Kf5 | only move | **great** (`only-good-move`) | first choice; second choice gives up 0.24 |
| Kasparov vs Topalov 1999, 25...Kb6 | only move (defence) | **best** | played to get out of check, and Black is worse afterwards |
| Carlsen vs Anand 2014 (6), 26...a4 | missed win | **miss** (`missed-win`) | 26.Kd2 gave up 0.19, 26...a4 gives up 0.20; Black had 0.66 on offer and ends 0.015 below where he was |
| Topalov vs Kramnik 2006 (2), 32.Qg6+ | missed win | **miss** (`missed-win`) | 31...Bxf8 gave up 0.40, 32.Qg6+ gives up 0.32 |
| Sina-Movahed vs Hikaru 2026, 61.h5 | (engine pick) | **miss** (`missed-win`) | 60...Ra5 gave up 0.24, 61.h5 gives up 0.25 |
| Sina-Movahed vs Hikaru 2026, 93.Qe8 | (engine pick) | **miss** (`missed-win`) | 92...Kb7 gave up 0.35, 93.Qe8 gives up 0.35 |
| EricRosen vs ni5hu 2026, 7.Re1 | quiet | **best** | first choice, nothing en prise |
| EricRosen vs ni5hu 2026, 24.Kf2 | quiet | **excellent** | second choice in this engine run; gives up 0.018 |
| EricRosen vs ni5hu 2026, 33.Ree7 | quiet | **best** | not in the engine's two lines, but nothing lost |
| Carlsen vs Anand 2014 (6), 27.Ke2 | quiet | **best** | first choice, nothing en prise |

Three of the five famous sacrifices come out Brilliant. The two that do not are kept as they are:
Kasparov's 24.Rxd4 because of the engine's evaluation, Marshall's 23...Qg3 because of the method's
"fewer hanging pieces than before" rule.

## Checked, and not checked

Checked (2026-11-13, on the development machine):

- The expectations for the 17 moments were worked out by hand from the stored engine output and
  the rules before the classifier was run on them. 16 matched on the first run. The one that did
  not (Marshall's 23...Qg3, expected brilliant) was a mistake in the hand analysis, which had
  missed that the g-pawn is pinned after the move; the rule was traced and the expectation
  corrected.
- Every rule of Brilliant and every decision in `classifyMove` has a test that fails when that one
  rule is removed (checked by removing each rule in turn and running the tests).
- The faster attacker search was compared with the first, plain version (every legal move
  generated) on all 2073 positions of 24 real games (the seven published games and seventeen
  recorded online games): 124443 comparisons of attackers, direct attackers and defenders. The
  first comparison found 1 difference, a tie between two captures decided in a different order
  when one of them was en passant; the order was fixed, a test with that position added, and the
  second full comparison found 0 differences. The cached `getUnsafePieces` was compared with the
  uncached version on the same positions (both colours, four kinds of last capture): 16584
  comparisons, 1586 of them with at least one unsafe piece, 0 differences.
- Classifying the 85-move fixture game takes about 60 ms the first time on the development
  machine (about 900 ms before the faster search).

Not checked:

- The code was **not** run side by side with WintrChess's own code. Agreement with WintrChess
  rests on reading its source and on the tests here.
- Chess.com's own description of Miss was not read at the source (login required).
- Nothing here was compared with Chess.com's labels; that is the benchmark task of the brief.
