# Recorded Lichess cloud-eval responses

Real response bodies from `GET https://lichess.org/api/cloud-eval`, recorded on 2026-11-13
(14:09 UTC) with curl. Nothing was trimmed or changed; the only difference from the bytes received
is whitespace, because Prettier re-indents JSON files in this repository (the bodies arrive on one
line):

```bash
curl -sS -A 'chess-review-dev' -G 'https://lichess.org/api/cloud-eval' \
  --data-urlencode 'fen=<FEN>' --data-urlencode 'multiPv=2' -o <file>
```

The explicit user agent is needed because Lichess answers 404 to curl's default one. Recording
again will give different numbers: cloud evaluations are replaced as deeper ones are submitted.

| File | Status | Position (`fen` parameter) | Why it is here |
|---|---|---|---|
| `cloud-eval-after-e4.json` | 200 | `rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1` (after 1. e4, Black to move) | Normal response. Black is to move and `cp` is +22: evidence that scores are from White's point of view. The line also contains `e1h1` (castling as king takes rook) at its sixth move. |
| `cloud-eval-ruy-lopez-castling.json` | 200 | `r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 5` (1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6, White to move) | Castling is the best move and is written `e1h1`. The second line holds `e8h8` for Black. |
| `cloud-eval-fools-mate.json` | 200 | `rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2` (after 1. f3 e5 2. g4, Black to move) | A mate score. Black mates in one and `mate` is −1: evidence that mate values are from White's point of view too. |
| `cloud-eval-not-found.json` | 404 | `r5k1/4R3/1p1r3p/p1p3p1/3p1p2/3P1P2/PP1B1KP1/2R5 w - - 0 31` (position after ply 60 of `fixtures/lichess-LAGvRNey`) | The body Lichess sends when it has no evaluation for a position. |

Tests that need a response Lichess did not give (for example one with fewer lines than asked for)
change a recorded response inside the test itself and say so there.
