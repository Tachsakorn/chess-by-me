import { Chess } from 'chess.js';
import type { EngineLine, EvalSource, GameRecord, PositionEval, Score } from '@/contract';
import type { WhiteEval } from './cloudEval';
import { EngineError } from './errors';
import { walkLine } from './pv';
import { toWhiteScore } from './score';
import type { UciEngine } from './uciEngine';

export interface EvaluateGameDeps {
  engine: Pick<UciEngine, 'evaluate'>;
  /**
   * Looks a position up in cloud eval; null (or a rejection) means "not there".
   * Scores must already be from White's point of view, as `fetchCloudEval` returns them.
   */
  cloud?: (fen: string) => Promise<WhiteEval | null>;
  /** Expected points for White, 0..1. Supplied by the classification package at integration. */
  whiteExpected: (score: Score) => number;
}

/** Lines are cut to this many half-moves. */
const MAX_LINE_PLIES = 10;
/** After this many cloud misses in a row the game has left known theory: stop asking. */
const MAX_CLOUD_MISSES_IN_A_ROW = 2;

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

/**
 * The verdict when the position itself ends the game: checkmate, stalemate, or
 * a dead position (not enough material for any mate). Null otherwise.
 *
 * chess.js's `isGameOver()` is deliberately not used: it is also true once the
 * fifty-move counter reaches 100 half-moves, but that draw is not automatic (it
 * has to be claimed), so a game can carry on past it and such a position must
 * not be scored as "over". Repetition cannot be seen from a single FEN at all.
 * Both kinds of position are searched like any other.
 */
function decidedByRules(chess: Chess): Score | null {
  if (chess.isCheckmate()) {
    return { kind: 'over', winner: chess.turn() === 'w' ? 'black' : 'white' };
  }
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return { kind: 'over', winner: null };
  return null;
}

function isUsableScore(score: Score): boolean {
  if (score.kind === 'cp') return Number.isFinite(score.value);
  if (score.kind === 'mate') return Number.isInteger(score.moves) && score.moves >= 1;
  return false;
}

/**
 * Builds the contract's lines from candidates given best first: each line is
 * replayed from `fen`, cut at `MAX_LINE_PLIES` and at the first illegal move,
 * and given its SAN. A candidate that does not start with a legal move is
 * dropped. If the best candidate is unusable the result is empty: a second
 * choice is never promoted to first.
 */
function toLines(
  fen: string,
  candidates: Array<{ score: Score; moves: string[] }>,
  multiPv: number,
): EngineLine[] {
  const lines: EngineLine[] = [];
  for (const [index, candidate] of candidates.slice(0, multiPv).entries()) {
    const { uci, san } = isUsableScore(candidate.score)
      ? walkLine(fen, candidate.moves, { maxPlies: MAX_LINE_PLIES, kingToRookCastling: false })
      : { uci: [], san: [] };
    if (uci.length === 0) {
      if (index === 0) return [];
      continue;
    }
    lines.push({ rank: lines.length + 1, score: candidate.score, uci, san });
  }
  return lines;
}

async function askCloud(
  cloud: NonNullable<EvaluateGameDeps['cloud']>,
  fen: string,
): Promise<WhiteEval | null> {
  try {
    return await cloud(fen);
  } catch {
    return null;
  }
}

/**
 * Evaluates every position of a game, in order: the starting position and the
 * position after each move. Each result is passed to `onPosition` as soon as it
 * is known and the full list is returned at the end.
 *
 * Per position: decided by the rules if the game is over there (never sent to
 * the engine); otherwise cloud eval if it has the position; otherwise a local
 * search. Every score in the result is from White's point of view.
 *
 * Rejects with an `EngineError`: `cancelled` when `signal` aborts (no
 * `onPosition` call follows), `unsupported-game` when a position is not a valid
 * FEN, and whatever the engine rejects with. Nothing is retried and nothing is
 * reused from one position for another.
 *
 * With `concurrency` above 1 (and no cloud eval) that many searches run at once: `deps.engine`
 * must then be a pool that gives each its own engine. Positions are still reported and
 * returned in ply order. After a failure no new search starts.
 */
export async function evaluateGame(
  game: Pick<GameRecord, 'initialFen' | 'moves'>,
  options: { depth: number; multiPv: number; concurrency?: number },
  deps: EvaluateGameDeps,
  onPosition: (position: PositionEval, done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PositionEval[]> {
  if (!isPositiveInteger(options.depth) || !isPositiveInteger(options.multiPv)) {
    throw new RangeError('depth and multiPv must be positive whole numbers');
  }
  const throwIfCancelled = () => {
    if (signal?.aborted) throw new EngineError('cancelled');
  };

  const fens = [game.initialFen, ...game.moves.map((move) => move.fenAfter)];
  const total = fens.length;
  const positions: PositionEval[] = [];
  let cloud = deps.cloud;
  let cloudMisses = 0;

  /** One position: decided by the rules, from the cloud, or searched. */
  const evaluateOne = async (ply: number, fen: string): Promise<PositionEval> => {
    throwIfCancelled();

    let chess: Chess;
    try {
      chess = new Chess(fen);
    } catch {
      throw new EngineError('unsupported-game', `position ${ply} is not a valid FEN: ${fen}`);
    }

    let position: PositionEval;
    const over = decidedByRules(chess);
    if (over) {
      position = {
        ply,
        fen,
        score: over,
        whiteExpected: deps.whiteExpected(over),
        depth: 0,
        lines: [],
        source: 'rules',
      };
    } else {
      let found: { depth: number; lines: EngineLine[]; source: EvalSource } | null = null;

      if (cloud) {
        const hit = await askCloud(cloud, fen);
        throwIfCancelled();
        // Cloud scores are White-relative already: no conversion here.
        const lines =
          hit && isPositiveInteger(hit.depth)
            ? toLines(
                fen,
                hit.lines.map((line) => ({ score: line.score, moves: line.uci })),
                options.multiPv,
              )
            : [];
        if (hit && lines.length > 0) {
          found = { depth: hit.depth, lines, source: 'cloud' };
          cloudMisses = 0;
        } else {
          cloudMisses += 1;
          if (cloudMisses >= MAX_CLOUD_MISSES_IN_A_ROW) cloud = undefined;
        }
      }

      if (!found) {
        const raw = await deps.engine.evaluate(fen, options.depth, signal);
        throwIfCancelled();
        // The one place engine scores (side to move) become White-relative.
        const whiteToMove = chess.turn() === 'w';
        const lines = isPositiveInteger(raw.depth)
          ? toLines(
              fen,
              raw.lines.map((line) => ({
                score: toWhiteScore(line.score, whiteToMove),
                moves: line.pv,
              })),
              options.multiPv,
            )
          : [];
        if (lines.length === 0) {
          throw new EngineError(
            'engine-crashed',
            `the engine gave no usable line for position ${ply} (${fen})`,
          );
        }
        found = { depth: raw.depth, lines, source: 'engine' };
      }

      const best = found.lines[0];
      if (!best) throw new EngineError('engine-crashed', `no line for position ${ply}`);
      position = {
        ply,
        fen,
        score: best.score,
        whiteExpected: deps.whiteExpected(best.score),
        depth: found.depth,
        lines: found.lines,
        source: found.source,
      };
    }

    return position;
  };

  // One search at a time with cloud eval (its miss count follows the order of the game);
  // otherwise up to `concurrency` at once, each on its own engine (the caller's engine pool).
  const concurrency = deps.cloud ? 1 : Math.max(1, Math.floor(options.concurrency ?? 1));
  const results: Array<PositionEval | undefined> = new Array(total);
  let next = 0;
  let reported = 0;
  await new Promise<void>((resolve, reject) => {
    let failed = false;
    let active = 0;
    const pump = () => {
      if (failed) return;
      // Reported strictly in ply order, as soon as every earlier position is known.
      for (let ready = results[reported]; ready; ready = results[reported]) {
        positions.push(ready);
        reported += 1;
        onPosition(ready, reported, total);
      }
      if (reported === total) {
        resolve();
        return;
      }
      while (active < concurrency && next < total) {
        const ply = next;
        next += 1;
        active += 1;
        evaluateOne(ply, fens[ply]!).then(
          (position) => {
            active -= 1;
            results[ply] = position;
            pump();
          },
          (error: unknown) => {
            if (failed) return;
            failed = true;
            reject(error);
          },
        );
      }
    };
    pump();
  });
  throwIfCancelled();
  return positions;
}

/**
 * Evaluates one position on its own, exactly as `evaluateGame` evaluates each position of a game
 * (decided by the rules when the game is over there, otherwise searched; White's point of view).
 * The result's `ply` is 0: the caller knows where the position belongs.
 */
export async function evaluatePosition(
  fen: string,
  options: { depth: number; multiPv: number },
  deps: Pick<EvaluateGameDeps, 'engine' | 'whiteExpected'>,
  signal?: AbortSignal,
): Promise<PositionEval> {
  const [position] = await evaluateGame(
    { initialFen: fen, moves: [] },
    options,
    deps,
    () => {},
    signal,
  );
  if (!position) throw new EngineError('engine-crashed', `no evaluation for ${fen}`);
  return position;
}
