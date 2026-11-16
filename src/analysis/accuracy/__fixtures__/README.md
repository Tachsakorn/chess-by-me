# Accuracy fixtures

## lichess-analysed.ndjson

Five real, public, computer-analysed games of the Lichess account `EricRosen`
(the newest five at download time, played 2026-11-12 and 2026-11-13), exactly as
the Lichess API returned them on 2026-11-13. Each line is one game with the
server's per-ply evaluations (`analysis`) and Lichess's own per-player accuracy
(`players.<color>.analysis.accuracy`).

Obtained with:

```bash
node scripts/fetch-lichess-accuracy-sample.mjs EricRosen 5
```

which requests

```
https://lichess.org/api/games/user/EricRosen?max=5&analysed=true&evals=true&accuracy=true&pgnInJson=true
```

with `Accept: application/x-ndjson` and `User-Agent: chess-review-dev`.

Used by `gameAccuracy.test.ts` to check that `computeAccuracy` reproduces
Lichess's reported accuracy within 1.0 for both players of every game.

Notes on the data, as observed:

- `analysis[i]` is the evaluation after ply `i + 1`, from White's side (`eval` in
  centipawns or `mate` in moves, negative when Black mates). The start position
  is not included; the test uses +15 cp there, Lichess's own fallback for
  analyses without a stored start evaluation.
- For a game ending in checkmate the final entry is sometimes `mate: 0` and
  sometimes absent. The test reads `mate: 0` as a finished game won by
  `winner`, and otherwise uses the entries that are present.
