/**
 * Reading the text an engine writes over UCI.
 *
 * Protocol reference: the UCI specification (Stefan Meyer-Kahlen, April 2006),
 * see docs/sources/engine.md. Only the two answers this app needs are parsed:
 * `info` lines that carry an exact score with a principal variation, and
 * `bestmove`.
 */

/** A score as the engine reports it: from the point of view of the side to move. */
export interface UciScore {
  kind: 'cp' | 'mate';
  value: number;
}

export interface UciInfo {
  depth: number;
  /** Rank of this line among the requested lines; 1 is the engine's first choice. */
  multiPv: number;
  score: UciScore;
  /** Moves in UCI notation, starting from the searched position. */
  pv: string[];
}

function tokens(line: string): string[] {
  return line.trim().split(/\s+/);
}

function integer(token: string | undefined): number | null {
  return token !== undefined && /^-?\d+$/.test(token) ? Number(token) : null;
}

/**
 * Parses one `info` line. Returns null for anything that is not a usable
 * search result: other commands, `info string ...`, progress lines without a
 * score or a pv, and scores marked `lowerbound`/`upperbound` (those are
 * unfinished bounds from an aspiration window, not evaluations).
 */
export function parseInfo(line: string): UciInfo | null {
  const t = tokens(line);
  if (t[0] !== 'info' || t[1] === 'string') return null;

  let depth: number | null = null;
  let multiPv = 1;
  let score: UciScore | null = null;
  let pv: string[] | null = null;

  for (let i = 1; i < t.length && pv === null; i++) {
    switch (t[i]) {
      case 'string':
        // Free text runs to the end of the line; nothing after it is data.
        return null;
      case 'depth': {
        depth = integer(t[++i]);
        if (depth === null) return null;
        break;
      }
      case 'multipv': {
        const rank = integer(t[++i]);
        if (rank === null) return null;
        multiPv = rank;
        break;
      }
      case 'score': {
        const kind = t[++i];
        const value = integer(t[++i]);
        if ((kind !== 'cp' && kind !== 'mate') || value === null) return null;
        const bound = t[i + 1];
        if (bound === 'lowerbound' || bound === 'upperbound') return null;
        score = { kind, value };
        break;
      }
      case 'pv':
        pv = t.slice(i + 1);
        break;
      default:
        break;
    }
  }

  if (depth === null || depth < 0 || multiPv < 1 || score === null) return null;
  if (pv === null || pv.length === 0) return null;
  return { depth, multiPv, score, pv };
}

/** The move of a `bestmove` line; null for `bestmove (none)` and for any other line. */
export function parseBestMove(line: string): string | null {
  const t = tokens(line);
  if (t[0] !== 'bestmove') return null;
  const move = t[1];
  if (move === undefined || move === '(none)') return null;
  return move;
}
