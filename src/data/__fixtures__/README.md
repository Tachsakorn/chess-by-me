# Recorded API responses

Real responses from public APIs, recorded on 2026-11-13 by `scripts/record-import-fixtures.mjs`
(run `node scripts/record-import-fixtures.mjs` to record again; the contents will differ because
the accounts keep playing). Both accounts are public figures and the data is public. Requests
carry the generic User-Agent `chess-review-dev`.

| File | Source | Trimming |
|---|---|---|
| `lichess-user.ndjson` | `https://lichess.org/api/games/user/EricRosen?max=5&pgnInJson=true&clocks=true&opening=true`, header `Accept: application/x-ndjson` | none (5 games, as returned) |
| `chesscom-archives.json` | `https://api.chess.com/pub/player/hikaru/games/archives` | none |
| `chesscom-month.json` | `https://api.chess.com/pub/player/hikaru/games/2026/11` (the newest archive at the time) | only the last 6 of 220 games kept, wrapped as `{ "games": [...] }` |
| `chesscom-prev-month.json` | `https://api.chess.com/pub/player/hikaru/games/2026/10` (the second newest archive) | only the last 6 of 583 games kept, same wrapping. Added so the "second archive" path is tested against a real response. |

Neither month held a game with `rules` other than `chess`, so none was added. Tests that need a non-standard Chess.com game change the `rules` field of one recorded game inside
the test itself and say so there.
