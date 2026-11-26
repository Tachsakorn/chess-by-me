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

type Page =
  | { ok: false; result: ImportResult }
  | {
      ok: true;
      entries: { createdAt: number; game: GameRecord }[];
      lines: number;
      skipped: number;
      /** The oldest start time on the page, variants included; null for an empty page. */
      oldest: number | null;
    };

/** One request: at most `max` games, newest first, within `since`..`until` (ms since 1970). */
async function fetchPage(
  username: string,
  range: { max: number; since?: number; until?: number },
  options: FetchOptions,
): Promise<Page> {
  const { max } = range;
  const since = range.since !== undefined ? `&since=${Math.floor(range.since)}` : '';
  const until = range.until !== undefined ? `&until=${Math.floor(range.until)}` : '';
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username.trim())}?max=${max}${since}${until}&pgnInJson=true&clocks=true&opening=true`;

  const got = await siteGet(url, 'application/x-ndjson', options);
  if (!got.ok) return { ok: false, result: got };
  if (!isSuccess(got.status)) return { ok: false, result: httpFailure(got.status) };
  const body = got.text;

  const entries: { createdAt: number; game: GameRecord }[] = [];
  let skipped = 0;
  let lines = 0;
  let oldest: number | null = null;
  for (const text of body.split('\n')) {
    if (text.trim() === '') continue;
    lines += 1;
    let line: LichessLine;
    try {
      line = JSON.parse(text) as LichessLine;
    } catch {
      skipped++;
      continue;
    }
    if (typeof line.createdAt === 'number') {
      oldest = oldest === null ? line.createdAt : Math.min(oldest, line.createdAt);
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

  return { ok: true, entries, lines, skipped, oldest };
}

/**
 * Fetches a user's newest games (at most `max`, default 50) from Lichess. With `since` (ms since
 * 1970) only the games started at or after it come back, so an app that already holds the older
 * ones does not download them again (Fable review A4-01).
 *
 * With `catchUp` as well, a full page is followed by the page before it, until every game since
 * `since` is here or `catchUp` games are (Fable review 1.1 B5-03: with more than `max` games
 * since the last visit, the older ones were missed for good, as the next visit starts after the
 * newest one). One request at a time, as Lichess asks.
 */
export async function fetchLichessGames(
  username: string,
  options: FetchOptions & { max?: number; since?: number; catchUp?: number } = {},
): Promise<ImportResult> {
  const max = options.max ?? 50;
  const entries: { createdAt: number; game: GameRecord }[] = [];
  let skipped = 0;
  let until: number | undefined;
  for (;;) {
    const page = await fetchPage(
      username,
      {
        max,
        ...(options.since !== undefined ? { since: options.since } : {}),
        ...(until !== undefined ? { until } : {}),
      },
      options,
    );
    // A page that fails fails the whole: storing only the newest games would leave a gap.
    if (!page.ok) return page.result;
    entries.push(...page.entries);
    skipped += page.skipped;
    const more =
      options.catchUp !== undefined &&
      options.since !== undefined &&
      page.lines >= max &&
      page.oldest !== null &&
      entries.length < options.catchUp;
    if (!more || page.oldest === null) break;
    until = page.oldest - 1;
  }

  if (entries.length === 0) {
    return failure('no-games', skipped > 0 ? `${skipped} skipped` : null);
  }
  const seen = new Set<string>();
  const unique = entries.filter((e) => !seen.has(e.game.id) && seen.add(e.game.id));
  unique.sort((a, b) => b.createdAt - a.createdAt);
  return { ok: true, games: unique.map((e) => e.game), skipped };
}
