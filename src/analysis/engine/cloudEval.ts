import type { Score } from '@/contract';
import { Chess } from 'chess.js';
import { walkLine } from './pv';

/**
 * Lichess cloud evaluation: evaluations of common positions that Lichess users'
 * engines have already computed, served without a key.
 *
 * Endpoint and field meanings: docs/sources/engine.md. Two facts matter here and
 * both were checked against the API specification and recorded responses:
 * - `cp` and `mate` are from WHITE's point of view (unlike UCI output), so they
 *   are NOT flipped by the side to move;
 * - castling is written as king takes rook (`e1h1`), so every line is replayed
 *   with chess.js and rewritten to standard UCI.
 */

/** An evaluation whose scores are already from White's point of view. */
export interface WhiteEval {
  depth: number;
  lines: Array<{ rank: number; score: Score; uci: string[] }>;
}

export interface CloudEvalOptions {
  /** How many lines to ask for. */
  multiPv: number;
  /** A cloud evaluation shallower than this counts as a miss. */
  minDepth: number;
  /** Give up after this long; 1500 ms by default. */
  timeoutMs?: number;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export const CLOUD_EVAL_URL = 'https://lichess.org/api/cloud-eval';
const DEFAULT_TIMEOUT_MS = 1500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toScore(pv: Record<string, unknown>): Score | null {
  const { cp, mate } = pv;
  if (typeof mate === 'number' && Number.isInteger(mate) && mate !== 0) {
    return { kind: 'mate', moves: Math.abs(mate), winner: mate > 0 ? 'white' : 'black' };
  }
  if (typeof cp === 'number' && Number.isInteger(cp)) return { kind: 'cp', value: cp };
  return null;
}

/** Turns a response body into a `WhiteEval`, or null if any part of it cannot be trusted. */
function toWhiteEval(
  body: unknown,
  fen: string,
  multiPv: number,
  minDepth: number,
  legalMoves: number,
): WhiteEval | null {
  if (!isRecord(body)) return null;
  const { depth, pvs } = body;
  if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < minDepth) return null;
  if (!Array.isArray(pvs)) return null;
  // Fewer lines than asked for is only acceptable when the position has no more moves to offer.
  if (pvs.length < Math.min(multiPv, legalMoves)) return null;

  const lines: WhiteEval['lines'] = [];
  for (const pv of pvs.slice(0, multiPv) as unknown[]) {
    if (!isRecord(pv) || typeof pv.moves !== 'string') return null;
    const score = toScore(pv);
    if (!score) return null;
    const { uci } = walkLine(fen, pv.moves.trim().split(/\s+/), {
      maxPlies: Number.POSITIVE_INFINITY,
      kingToRookCastling: true,
    });
    // A line that does not even start with a legal move is not about this position.
    if (uci.length === 0) return null;
    lines.push({ rank: lines.length + 1, score, uci });
  }
  return { depth, lines };
}

/**
 * Asks Lichess for a stored evaluation of `fen`. Resolves to null on a miss and
 * on every kind of trouble (not found, rate limited, offline, slow, cancelled,
 * unreadable answer): the caller then searches locally. It never rejects.
 */
export async function fetchCloudEval(
  fen: string,
  options: CloudEvalOptions,
): Promise<WhiteEval | null> {
  const { multiPv, minDepth, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
  if (signal?.aborted) return null;
  if (!Number.isInteger(multiPv) || multiPv < 1) return null;

  let legalMoves: number;
  try {
    legalMoves = new Chess(fen).moves().length;
  } catch {
    return null;
  }
  if (legalMoves === 0) return null;

  // Kept in a local so it is called as a plain function: `options.fetch(...)` would call the
  // browser's fetch with the wrong `this`.
  const doFetch = options.fetch ?? fetch;
  const url = `${CLOUD_EVAL_URL}?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`;
  const controller = new AbortController();
  let giveUp: () => void = () => {};
  const gaveUp = new Promise<null>((resolve) => {
    giveUp = () => {
      controller.abort();
      resolve(null);
    };
  });
  const timer = setTimeout(giveUp, timeoutMs);
  signal?.addEventListener('abort', giveUp, { once: true });

  try {
    const answered = (async () => {
      // No custom headers: the request stays a "simple" CORS request without a preflight.
      const response = await doFetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      return toWhiteEval(await response.json(), fen, multiPv, minDepth, legalMoves);
    })();
    // If the timeout wins the race, a later failure of the request must not go unhandled.
    answered.catch(() => {});
    return await Promise.race([answered, gaveUp]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', giveUp);
  }
}
