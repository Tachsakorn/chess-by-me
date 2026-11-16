# Sources: engine and cloud eval (`src/analysis/engine`)

Accessed 2026-11-13. No code was copied from Chesskit, lila or WintrChess; nothing in this package
was written with their source open. The engine driver in `scripts/make-fixture.mjs` (this
repository, an earlier session; since replaced by `scripts/make-fixture.script.ts`) was read as an
example of running Stockfish from Node.

## Engine files

| Item | Value | Source |
|---|---|---|
| Package | `stockfish` 17.1.0 (npm), licence GPL, repository `nmrugg/stockfish.js` | `node_modules/stockfish/package.json` |
| Lite build | `stockfish-17.1-lite-single-03e3232.js` (20,672 bytes) + `.wasm` (7,280,741 bytes) | `node_modules/stockfish/src/` |
| Full build | `stockfish-17.1-single-a496a04.js` (20,593 bytes) + six `-part-N.wasm` files (13,175,551 bytes each) | same |
| Served from | `/engines/` (copied by `scripts/copy-engines.mjs`) | this repository |
| Why single-threaded | They run without cross-origin isolation headers | `docs/BENCHMARKS.md` (checked there: `crossOriginIsolated = false`, ran to the end) |

`engineFiles.test.ts` fails if the installed package stops containing these files or is no longer a
17.1 release.

How the scripts behave (read from the lite script itself, 2026-11-13):

- In a Web Worker they take one UCI command per posted string, queue commands that arrive before
  the WASM is ready (`processCommand ? processCommand(data) : queue.push(data)`), and post output
  back as strings. Text the engine prints to stderr is posted the same way.
- Run as a main script in Node they read commands from stdin with `readline` and write to stdout.
  The integration test uses this (`testing/nodeTransport.ts`).

The Worker wiring (`createWorkerTransport`) has not been run in a browser by this package's tests.
The same protocol over a Worker was exercised by the earlier benchmark page
(`spikes/stockfish-bench/`).

## UCI protocol

Source: "Description of the universal chess interface (UCI)", Stefan Meyer-Kahlen and Rudolf Huber,
April 2006, read at https://backscattering.de/chess/uci/ on 2026-11-13. What this package relies on:

| Fact | Words of the specification | Used in |
|---|---|---|
| Scores are from the side to move | `score cp <x>`: "the score from the engine's point of view in centipawns" | `score.ts` flips by the side to move, once |
| Sign of mate | `mate <y>`: "mate in y moves, not plies. If the engine is getting mated use negative values for y." | `score.ts` |
| Bounds are not evaluations | `lowerbound`: "the score is just a lower bound"; `upperbound`: "the score is just an upper bound" | `uci.ts` ignores such lines |
| Several lines | `multipv <num>`: "for the best move/pv add multipv 1 in the string when you send the pv" | `uci.ts` (a line without `multipv` is rank 1) |
| Move format | "long algebraic notation ... e2e4, e7e5, e1g1 (white short castling), e7e8q (for promotion)" | `pv.ts` |
| King takes rook | With `UCI_Chess960`, "castling moves are sent in the form king "takes" his own rook. Example: e1h1" | why cloud eval writes `e1h1` |
| New game | `ucinewgame` is sent "when the next search ... will be from a different game"; the GUI "should always send isready after ucinewgame" | `UciEngine.newGame` |

Commands sent: `uci`, `setoption name MultiPV value <n>`, `setoption name Hash value 16`, `isready`, `ucinewgame`,
`position fen <fen>`, `go depth <n>`, `stop`. Answers read: `uciok`, `readyok`, `info ...`,
`bestmove ...`.

Checked against the real engine (`uciEngine.integration.test.ts`, lite build, depth 10, MultiPV 2):

- a position lost for Black with Black to move gives a negative score (side-to-move convention);
- mate in one for the side to move is `mate 1`;
- a position with a single legal move gives one line although two were asked for;
- after `stop`, `bestmove` arrives and the next search works;
- all 86 positions of the fixture game `fixtures/lichess-LAGvRNey` go through `evaluateGame`, the
  result passes `validateGameAnalysis`, every searched position reaches depth 10, and wherever the
  earlier full-build depth-18 evaluation of the same game (`analysis.json`) is decided by three
  pawns or more, the sign of the score agrees.

### Choices made in this app (not taken from a source)

- **Every position is searched from a cleared engine** (owner, 2026-11-15, speed round, choice "ก"): `ucinewgame` + `isready` before every `go`, so a result depends on the position alone, not on what the engine searched before. Until then one engine searched a game's positions in order with its hash carried over; on 119 games the two methods gave different labels for 18% of the moves (docs/BENCHMARKS.md). Because of this, up to four engines (`src/analysis/engineCount.ts`) search different positions of a game at once and give exactly what one engine gives. Single-threaded builds only: a multi-threaded Stockfish does not repeat its results.
- Hash 16 MB on every engine, set explicitly (it is Stockfish's default): the size of the table can change a result. Each lite engine holds about 60 MB whatever the hash (measured in Node).
- `start` gives up after 30 s (plan for this package).
- A result is made of the lines of the deepest depth at which rank 1 was reported; a rank missing
  at that depth is left out instead of being filled from a shallower depth.
- Lines are cut to 10 half-moves and at the first move chess.js does not accept.
- A position is decided without the engine when it is checkmate, stalemate or a dead position
  (chess.js `isInsufficientMaterial`). chess.js `isGameOver()` is not used, because it is also true
  once the fifty-move counter reaches 100 half-moves, and that is not always the end of a game:
  under the FIDE Laws of Chess the fifty-move draw has to be claimed and only 75 moves end the game
  by themselves (articles 9.3 and 9.6, cited from memory, not re-read for this work). A position
  that the game continued from must not be scored as "over", so such positions are searched like
  any other. Repetition cannot be seen from a single FEN at all.
- Cloud eval is no longer asked for the rest of a game after two misses in a row (plan for this
  package).
- **Single positions for "try your own move"** (owner, 2026-11-16, `src/analysis/positionEvaluator.ts`):
  one more engine of the same build, made when the first move is tried on the review screen and
  closed when the screen is left. It searches exactly as the game analysis does (`ucinewgame` before
  every `go`, depth 18, MultiPV 2, Hash 16 MB, through the same `evaluatePosition` code path), so a
  position gets the evaluation the game analysis would give it. Results are remembered by FEN in
  memory only, the game's own positions included; a search whose position is no longer part of
  the line is stopped with `stop`. Nothing here comes from a source: it is this app's own plumbing.
  Time for one move: docs/BENCHMARKS.md, run 6.

## Lichess cloud eval

| Item | Value | Source |
|---|---|---|
| Endpoint | `GET https://lichess.org/api/cloud-eval?fen=<FEN, percent-encoded>&multiPv=<n>` | Lichess API specification, `doc/specs/tags/analysis/api-cloud-eval.yaml` in `lichess-org/api`, commit `313e6aac0d60` (2026-11-07); rendered at https://lichess.org/api#tag/Analysis/operation/apiCloudEval |
| Key | None (`security: []` in the specification) | same |
| Response | `{ fen, knodes, depth, pvs: [{ moves, cp } or { moves, mate }] }` | `doc/specs/schemas/CloudEval.yaml`, same commit |
| Miss | HTTP 404 with `{"error":"No cloud evaluation available for that position"}` | recorded response, see below |
| CORS | `access-control-allow-origin: *` on a request carrying an `Origin` header | observed 2026-11-13 with `curl -H 'Origin: https://example.org' -D -` |
| `multiPv` default | 1; "Up to 5 variations may be available" | specification |
| Intended use | "Use this endpoint to fetch a few positions here and there." | specification |

### Point of view of `cp` and `mate`: White's

Both are from **White's point of view**, whoever is to move. `cloudEval.ts` therefore does not flip
them by the side to move (UCI engine output is the opposite convention and is flipped in
`score.ts`). Three independent pieces of evidence:

1. The specification says so: `cp` is "Evaluation in centi-pawns, from White's point of view" and
   `mate` is "Evaluation in moves to mate, from White's point of view" (`CloudEval.yaml`).
2. Recorded response for the position after 1. e4 (Black to move, known to be slightly better for
   White): the two lines are `e7e5 ...` with `cp: 22` and `c7c6 ...` with `cp: 27`. The values are
   positive although Black is to move, and the first (best for Black) line has the *lower* value,
   which only makes sense if higher means better for White.
3. Recorded response for the position after 1. f3 e5 2. g4 (Black to move and mating with Qh4#):
   `{"moves":"d8h4","mate":-1}`. Black delivers the mate and the value is negative. A recorded
   answer for a White-to-move mate (1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6, Qxf7#) gave `"mate":1`; that
   one was looked at but not saved as a fixture.

So: `cp: n` becomes `{ kind: 'cp', value: n }`; `mate: n` becomes
`{ kind: 'mate', moves: |n|, winner: n > 0 ? 'white' : 'black' }`.

### Castling notation

The specification describes `moves` as "Variation in UCI notation (King to rook for
Chess960-compatible castling notation)". The recorded responses confirm it: `e1h1` and `e8h8` for
short castling. `pv.ts` replays every line with chess.js and rewrites such a move to the standard
`e1g1`/`e8g8`/`e1c1`/`e8c8`, only when that castling move is legal in the position at hand.

### Other observations (2026-11-13)

- Stored evaluations are kept per number of lines: the same position asked with `multiPv=1` and
  `multiPv=2` returned different entries (depth 245 with one line, depth 44 with two).
- Lines hold at most 10 half-moves in every response seen.
- `%20` and `+` for the spaces of the FEN both work; the app sends `%20` (`encodeURIComponent`).
- Recordings were made with `-A 'chess-review-dev'` because the project notes
  (`docs/sources/import.md`) say Lichess answers 404 to curl's default user agent; that was not
  re-checked here. Node's own `fetch` with its default user agent did get an answer. A browser
  sends its own user agent and the app sets none.
- One live run of `fetchCloudEval` from Node (a throwaway test, not kept): a hit for the position
  after 1. e4 in 144 ms, a hit for the Ruy Lopez position in 40 ms with `e1h1` returned as `e1g1`,
  and `null` for the obscure position in 271 ms.

The recorded responses are in `src/analysis/engine/__fixtures__/` with a README giving the exact
requests.

### Choices made in this app (not taken from a source)

- Timeout 1500 ms per request (plan for this package; PROJECT_BRIEF section 3 asks for a short
  timeout).
- A stored evaluation shallower than the depth the caller asks for counts as a miss.
- A response with fewer lines than asked for counts as a miss, unless the position has fewer legal
  moves than that.
- Rate limiting (HTTP 429), any other status, a network error, a timeout and an unreadable body all
  count as a miss; none of them is an error for the game being analysed.

## Not checked

- Nothing in this package has been run in a browser: not `createWorkerTransport`, and not a
  cloud-eval request made by a browser (the CORS header was seen with curl only).
- No real HTTP 429 from Lichess was seen; its handling is tested with a stub.
- No real engine crash or out-of-memory failure was seen. The engine scripts contain no
  recognisable out-of-memory message, so this package never reports the contract's `out-of-memory`
  code: a failure of the engine process is `engine-load-failed` before the handshake finishes and
  `engine-crashed` after.
- Only the lite build was run. The full build is covered by the file-name test only.
