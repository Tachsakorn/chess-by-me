import type { GameRecord, ImportResult, Termination } from '@/contract';
import { failure, httpFailure, isSuccess, type FetchOptions } from './errors';
import { siteGet } from './http';
import { gameFromPgn } from './pgn';

interface LichessPlayer {
  rating?: number;
}

interface LichessLine {
  id: string;
  rated?: boolean;
  variant?: string;
  status?: string;
  createdAt: number;
  /** Absent when the game has no winner. */
  winner?: string;
  players?: { white?: LichessPlayer; black?: LichessPlayer };
  pgn?: string;
}

/** Statuses that name the ending exactly. Others (draw, ...) are derived from the final position. */
const STATUS_TERMINATION: Record<string, Termination> = {
  mate: 'checkmate',
  resign: 'resignation',
  stalemate: 'stalemate',
  outoftime: 'timeout',
  timeout: 'abandonment',
};

/**
 * Fetches a user's newest games (at most `max`, default 50) from Lichess. With `since` (ms since
 * 1970) only the games started at or after it come back, so an app that already holds the older
 * ones does not download them again (Fable review A4-01).
 */
export async function fetchLichessGames(
  username: string,
  options: FetchOptions & { max?: number; since?: number } = {},
): Promise<ImportResult> {
  const max = options.max ?? 50;
  const since = options.since !== undefined ? `&since=${Math.floor(options.since)}` : '';
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username.trim())}?max=${max}${since}&pgnInJson=true&clocks=true&opening=true`;

  const got = await siteGet(url, 'application/x-ndjson', options);
  if (!got.ok) return got;
  if (!isSuccess(got.status)) return httpFailure(got.status);
  const body = got.text;

  const entries: { createdAt: number; game: GameRecord }[] = [];
  let skipped = 0;
  for (const text of body.split('\n')) {
    if (text.trim() === '') continue;
    let line: LichessLine;
    try {
      line = JSON.parse(text) as LichessLine;
    } catch {
      skipped++;
      continue;
    }
    if (line.variant !== 'standard' || typeof line.pgn !== 'string') {
      skipped++;
      continue;
    }
    // A clock ending with no winner is the flag-against-insufficient-material draw.
    const termination =
      line.status === 'outoftime' && line.winner === undefined
        ? 'timeout-vs-insufficient-material'
        : line.status
          ? STATUS_TERMINATION[line.status]
          : undefined;
    const game = gameFromPgn(line.pgn, {
      id: `lichess:${line.id}`,
      source: 'lichess',
      sourceUrl: `https://lichess.org/${line.id}`,
      playedAt: new Date(line.createdAt).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      rated: typeof line.rated === 'boolean' ? line.rated : null,
      whiteRating: line.players?.white?.rating ?? null,
      blackRating: line.players?.black?.rating ?? null,
      ...(termination ? { termination } : {}),
    });
    if (game) entries.push({ createdAt: line.createdAt, game });
    else skipped++;
  }

  if (entries.length === 0) {
    return failure('no-games', skipped > 0 ? `${skipped} skipped` : null);
  }
  entries.sort((a, b) => b.createdAt - a.createdAt);
  return { ok: true, games: entries.map((e) => e.game), skipped };
}
