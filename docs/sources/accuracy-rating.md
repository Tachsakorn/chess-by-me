# Sources: accuracy and estimated rating (`src/analysis/accuracy`, `src/analysis/rating`)

No code was copied. lila and scalachess are AGPL-3.0 and MIT respectively; they were read for the
method and the constants, and the code here was written from scratch. Constants were re-read from
the source files on 2026-11-13 at the commits named below.

## Accuracy

Method: Lichess's, described at https://lichess.org/page/accuracy.

### Win percentage (`winPercent.ts`)

Source: `lichess-org/scalachess`, commit `fbb8f2c75d25`, `core/src/main/scala/eval.scala`.

| What | Value | Where |
|---|---|---|
| Win % from centipawns | `50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)` | lines 101-110 (`MULTIPLIER = -0.00368208`) |
| Centipawn ceiling | scores beyond ±1000 count as ±1000 | lines 57, 66-68 (`CEILING = Cp(1000)`) |
| Forced mate | counts as the ceiling for the side that mates | line 98 |

A finished game (`over` in our contract) is not a case Lichess has; here a win counts as the
ceiling for the winner (about 97.5 %, not 100) and a draw as 0 cp, so that the mating move is
compared with a "mate in 1" evaluation on the same scale and loses nothing.

### One move (`moveAccuracy.ts`)

Source: `lichess-org/lila`, commit `3e79a4579cb0`, `modules/analyse/src/main/AccuracyPercent.scala`,
lines 52-54.

`accuracy = 103.1668100711649 * exp(-0.04354415386753951 * loss) - 3.166924740191411 + 1`, kept
within 0..100, where `loss` is the drop in the mover's win percentage. The `+ 1` is Lichess's
"uncertainty bonus". A move that does not lower the mover's win percentage scores 100.

### Whole game (`gameAccuracy.ts`)

Source: the same file, lines 79-111.

| What | Value |
|---|---|
| Window size | `(number of positions - 1) / 10`, whole number, kept within 2..8 |
| Windows | sliding windows of White's win %; the first moves share the opening window |
| Weight of a move | standard deviation of its window, kept within 0.5..12 |
| Per player | (volatility-weighted mean + harmonic mean of that player's moves) / 2 |
| Start position | +15 cp when no evaluation of it is stored (Lichess's fallback), used by the tests and the calibration script |

Choices made where Lichess gives no answer:

- Lichess reports no accuracy at all when a side has no move. Our contract needs a number, so a
  side with no moves gets 100 (it lost nothing).
- The harmonic mean treats an accuracy below 1 as 1, to avoid dividing by zero.

### Check against Lichess itself

`gameAccuracy.test.ts` runs `computeAccuracy` on five real analysed games
(`__fixtures__/lichess-analysed.ndjson`, see the README beside it) and requires both players'
results to be within 1.0 of the accuracy Lichess reports for the same game. All ten pass
(run on 2026-11-13). The sample has no drawn game.

## Estimated rating

Method: ours. A table of the middle 60 % (20th..80th percentile) of real players' ratings per
accuracy band and time class, built from the Lichess open database (CC0,
https://database.lichess.org/) by `scripts/calibrate-rating.script.ts`. The data used, the method,
the measured results and the caveats are in `docs/CALIBRATION.md`, which that script writes.

| What | Value | Where |
|---|---|---|
| Games | 20,000 analysed rated games from `lichess_db_standard_rated_2026-10.pgn.zst` | `docs/CALIBRATION.md` |
| Band | 20th..80th percentile of rating per 5-point accuracy bucket | script |
| Smoothing | each end made non-decreasing in accuracy (pool-adjacent-violators) | `monotone.ts` |
| Rounding | low end down, high end up to a multiple of 50; at least 100 wide | `rangeFromTable.ts` |
| Minimum | no estimate for a player with fewer than 10 moves | `estimateRating.ts` |
| Fallback | a time class with fewer than 2,000 training rows uses the all-games table | script, `estimateRating.ts` |
| Time class | Lichess's: `initial + 40 * increment` seconds; under 180 bullet, under 480 blitz, under 1500 rapid, otherwise classical | scalachess `fbb8f2c75d25`, `Speed.scala` and `Clock.scala` |

Things to know:

- The ratings are Lichess ratings, not Chess.com ratings.
- One game's accuracy says little about rating: in the calibration data it accounts for about
  5 % of the differences in rating (correlation 0.23). The ranges are therefore wide (about 750
  points) and move only a little with accuracy. The figures are in `docs/CALIBRATION.md`.
- Games with engine accounts (title `BOT`) are left out of the calibration data.
- The Lichess database files are written with pzstd, which puts a skippable frame before every
  compressed frame; Node's zstd decompressor rejects those, so the script strips them.
