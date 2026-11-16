# Sources: importing games (`src/data`)

Accessed 2026-11-13. No code was copied from Chesskit, lila or WintrChess.

## Endpoints

| Purpose | Request | Notes |
|---|---|---|
| Lichess games of a user | `GET https://lichess.org/api/games/user/<name>?max=50&pgnInJson=true&clocks=true&opening=true`, header `Accept: application/x-ndjson` | No key. One JSON object per line with fields `id`, `rated`, `variant`, `status`, `createdAt` (ms), `players.white/black.rating`, `pgn`. Docs: https://lichess.org/api#tag/Games/operation/apiGamesUser. Lichess answers 404 to the default curl user agent; the recording script sends `chess-review-dev`. Browsers cannot set a User-Agent (see "Manners" below). |
| Chess.com archive list | `GET https://api.chess.com/pub/player/<lowercase name>/games/archives` | No key. `{ "archives": [url, ...] }`, oldest first. Docs: https://www.chess.com/news/view/published-data-api |
| Chess.com month | `GET <archive url>` | `{ "games": [...] }`, oldest first. Per game: `url`, `pgn`, `uuid`, `end_time`, `rated`, `rules`, `time_class`, `time_control`, `white/black.{username,rating,result}`. |

Rules in the app: Lichess at most 50 games. Chess.com takes the newest archive and adds the next
newest one only if the first holds fewer than 50 games (counted as returned, variants included);
never more than two archives.

Since 2026-11-15 the app asks Lichess only for the games since the newest one it keeps
(`&since=<ms>`, the newest stored game's `createdAt`). A correspondence game created before that
game and finished after it would be missed; the app does not list correspondence games.

Chess.com has no "since": a month is the smallest piece the API gives (Fable review A4-01, the
part left after round 38). Checked against api.chess.com on 2026-11-15 (curl, and Edge through
Playwright from the dev server):

- Every answer carries a weak `ETag` and `Cache-Control: public, max-age=5` (archive list
  `max-age=60`). Sent back as `If-None-Match`, an unchanged month answers `304` with no body.
- `Last-Modified` of a month is the time of the request, so it says nothing.
- CORS: `Access-Control-Allow-Origin: *`, but the preflight allows only the `Origin` header and
  no `Access-Control-Expose-Headers` is sent, so a page can neither send `If-None-Match` itself
  nor read the `ETag`.
- The browser's own HTTP cache can: with `cache: 'no-cache'` it keeps its copy, sends
  `If-None-Match` itself and hands the page the full body after a 304. Measured in Edge: the
  2026/10 month of a busy player, 542 kB on the first request, 1.1 kB (304) on the second.

What the app does (`fetchChessComRecent` in `src/data/chesscom.ts`):

- All Chess.com requests use `cache: 'no-cache'`.
- A month is "over" one day after it ends (a game is filed under the month it ended in). Once an
  over month has been read and its games stored, its address is kept per account
  (`kv` `chesscom-months:<owner>`) and it is never requested again, nor anything older. Deleted
  with the account.
- The month being played is read each update; when nothing changed, that is a 304.

## What the device keeps (Fable review A6-02)

Each account keeps its newest 200 games (`KEEP_PER_ACCOUNT` in `src/data/keep.ts`, reasons
there). Older games are deleted after each update, except games that are analysed, that the user
has opened (`progress`), or that wait in the analysis queue. Games opened from Search, a link or
pasted PGN are kept under the owner `other` (database version 2; version 1 kept them with owner
null, outside the index) with the time they were last opened, and have no limit (owner,
2026-11-15). My Games › Others lists them.

## Manners (what the two sites ask of apps), checked 2026-11-15

Read on 2026-11-15 by the independent review (docs/reviews/fable-review.md, area 4, in the
review branch) and followed in `src/data/http.ts`:

- **Lichess**, https://lichess.org/page/api-tips and the API specification (lichess-org/api,
  commit `bbbd115`, 2026-11-13): "Only make one request at a time." On HTTP 429 "waiting one minute
  before retrying will be sufficient". "All requests going to lichess.org MUST include a
  `User-Agent` header with your website URL, or the name of your application, or a contact email
  … Requests missing an appropriate `User-Agent` header may be rejected or rate limited." The
  games export is throttled to 20 games per second for anonymous requests.
- **Chess.com**, https://www.chess.com/news/view/published-data-api: serial access is
  unlimited; parallel requests may get "429 Too Many Requests"; a recognizable User-Agent with
  contact information is how they reach a developer before blocking.

What the app does:

- One request at a time per site; the two sites may be asked at the same time.
- After a 429 the app does not call that site for 60 seconds and says "Try again in a moment".
- Every request gives up after 15 seconds.
- A new search cancels the requests of the old one; Search waits 800 ms after typing stops.
- **User-Agent:** a web page cannot set one (browsers forbid the header), so requests carry the
  browser's own User-Agent and `Origin: https://chessby.me`, which names the site. Lichess has
  answered 404 to a headless browser (docs/STATUS.md); ordinary browsers work. If Lichess tightens
  the rule, it will show as "Couldn't update Lichess". Before launch: tell Lichess about the app
  with a contact address (the owner's decision), and keep a `Referrer-Policy` that still sends
  the origin (`strict-origin-when-cross-origin`, see deploy/production/).

Neither API gives player titles in the Chess.com game list; only the Lichess PGN carries
`WhiteTitle`/`BlackTitle`. Chess.com games therefore have `title: null`.

## Time class

Lichess's rule: estimated duration = initial + 40 x increment (seconds); under 180 bullet, under
480 blitz, under 1500 rapid, otherwise classical. Checked on 2026-11-13 against scalachess commit
`fbb8f2c75d25`: `Clock.scala` has `estimateTotalSeconds = limitSeconds + 40 * incrementSeconds`, and
`Speed.scala` gives Blitz `180 to 479` and Rapid `480 to 1499`. Lichess also has UltraBullet (under
30) and Correspondence, which the contract does not; UltraBullet counts as bullet here. `1/86400`
style values are `daily`. For Chess.com games the API's own `time_class` is used instead of the
rule. A pasted Chess.com PGN has no `time_class`, so it gets the Lichess rule; Chess.com's own
boundaries differ (its blitz runs up to 10 minutes), so such a game can be classed differently
from what Chess.com shows.

## Termination

Chess.com result codes (taken from the non-`win` side; for draws both sides carry the code):

| Code | Termination |
|---|---|
| `checkmated` | `checkmate` |
| `resigned` | `resignation` |
| `timeout` | `timeout` |
| `abandoned` | `abandonment` |
| `stalemate` | `stalemate` |
| `repetition` | `repetition` |
| `agreed` | `agreement` |
| `insufficient` | `insufficient-material` |
| `50move` | `fifty-move` |
| `timevsinsufficient` | `timeout-vs-insufficient-material` |

Lichess `status`: `mate` `checkmate`, `resign` `resignation`, `stalemate` `stalemate`, `outoftime`
`timeout` (or `timeout-vs-insufficient-material` when the line has no `winner`: a game that ends
on the clock and is still a draw can only be that rule), `timeout` `abandonment`. Other statuses
(`draw`, ...) and pasted PGN are derived, in this order: a checkmate on the board; a clock ending
named in the `Termination` header together with a drawn result
(`timeout-vs-insufficient-material`); for draw or unknown results stalemate, insufficient
material, threefold repetition, fifty-move rule; then the `Termination` header (clock ending
`timeout`, `abandon...` `abandonment`); then the result (draw `agreement`, decisive
`resignation`); otherwise `unknown`.

`Termination` header wording that counts as a clock ending: Lichess `Time forfeit`; Chess.com
`<name> won on time` and `Game drawn by timeout vs insufficient material`. The Chess.com wording
was read from 583 real games (`api.chess.com/pub/player/hikaru/games/2026/10`, 2026-11-13), whose
headers were, in full: `<name> won by resignation`, `<name> won on time`, `<name> won by
checkmate`, `<name> won - game abandoned`, `Game drawn by repetition`, `Game drawn by insufficient
material`, `Game drawn by agreement`, `Game drawn by timeout vs insufficient material`, `Game drawn
by stalemate`. A fifty-move draw did not occur in that month, so its wording is unknown; it is
found from the position instead.

## Browser access (CORS)

Checked on 2026-11-13 with `curl` sending an `Origin` header: the Lichess export and both Chess.com
endpoints answer `Access-Control-Allow-Origin: *`. `Accept: application/x-ndjson` is a
CORS-safelisted header value, so the browser sends no preflight. Not yet exercised from a real
browser page.

## Live check

On 2026-11-13 `importGames` was run from Node against the real services: Lichess `EricRosen`
returned 50 games in about 3 s; Chess.com `Hikaru` returned 220 games (the whole newest month; there
is no upper limit on a month) in about 4.5 s; both newest first, every move with a clock, no
skipped games; an unknown user gave `user-not-found` on both.

## Error codes

HTTP 404 on the user lookup `user-not-found`; 404 on a month archive `source-unavailable`;
429 `rate-limited`; other non-2xx `source-unavailable`; a rejected request `network`; an aborted
request `cancelled`; a successful answer with nothing importable `no-games` (fetchers) or
`invalid-pgn` (pasted text).

## Clock and time spent

`[%clk h:mm:ss(.f)]` comment after a move gives the mover's remaining time. Time spent =
the same side's previous clock (initial time for its first move) + increment - this clock, floored
at 0.
