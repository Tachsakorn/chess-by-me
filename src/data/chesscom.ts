import type { GameRecord, ImportResult, TimeClass, Termination } from '@/contract';
import { failure, httpFailure, type FetchOptions } from './errors';
import { siteGetJson } from './http';
import { gameFromPgn } from './pgn';
import { parseTimeControl } from './timeControl';

interface ChessComPlayer {
  username?: string;
  rating?: number;
  result?: string;
}

interface ChessComGame {
  url?: string;
  pgn?: string;
  uuid?: string;
  end_time?: number;
  rated?: boolean;
  rules?: string;
  time_class?: string;
  time_control?: string;
  white?: ChessComPlayer;
  black?: ChessComPlayer;
}

const TIME_CLASSES: readonly string[] = ['bullet', 'blitz', 'rapid', 'classical', 'daily'];

/** Chess.com result codes that name how a game ended. "win" is not one of them. */
const RESULT_TERMINATION: Record<string, Termination> = {
  checkmated: 'checkmate',
  resigned: 'resignation',
  timeout: 'timeout',
  abandoned: 'abandonment',
  stalemate: 'stalemate',
  repetition: 'repetition',
  agreed: 'agreement',
  insufficient: 'insufficient-material',
  '50move': 'fifty-move',
  timevsinsufficient: 'timeout-vs-insufficient-material',
};

function terminationOf(game: ChessComGame): Termination | undefined {
  const codes = [game.white?.result, game.black?.result];
  const code = codes.find((c) => c !== undefined && c !== 'win');
  return code === undefined ? undefined : RESULT_TERMINATION[code];
}

function toRecord(game: ChessComGame): GameRecord | null {
  if (game.rules !== 'chess' || typeof game.pgn !== 'string' || !game.uuid) return null;
  const parsed = parseTimeControl(game.time_control);
  const timeClass =
    game.time_class && TIME_CLASSES.includes(game.time_class)
      ? (game.time_class as TimeClass)
      : (parsed?.timeClass ?? null);
  const timeControl = parsed ? { ...parsed, timeClass } : null;
  const termination = terminationOf(game);
  return gameFromPgn(game.pgn, {
    id: `chesscom:${game.uuid}`,
    source: 'chesscom',
    sourceUrl: game.url ?? null,
    rated: typeof game.rated === 'boolean' ? game.rated : null,
    timeControl,
    whiteRating: game.white?.rating ?? null,
    blackRating: game.black?.rating ?? null,
    ...(termination ? { termination } : {}),
  });
}

/** A day of margin after a month ends: a game is filed under the month it ended in. */
const CLOSED_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the month of an archive address (`.../games/2026/11`) is over at `now`: its games no
 * longer change, so once stored it need not be read again. False for any other address.
 */
export function archiveClosed(url: string, now: number): boolean {
  const match = /\/(\d{4})\/(\d{2})$/.exec(url);
  if (!match) return false;
  const nextMonth = Date.UTC(Number(match[1]), Number(match[2]), 1); // month index = month number
  return now >= nextMonth + CLOSED_AFTER_MS;
}

export interface RecentOptions extends FetchOptions {
  /** Default 50; see `fetchChessComRecent`. */
  minGames?: number;
  /** Archive addresses whose games are already stored and over: not read again. */
  done?: readonly string[];
  /** ms since 1970; default Date.now(). */
  now?: number;
}

/**
 * Fetches a user's newest games from Chess.com: the newest monthly archive, plus the next
 * newest when the first holds fewer than `minGames` (default 50). Never more than two archives.
 *
 * Chess.com's API has no "games since" (Fable review A4-01), so the month is the smallest piece.
 * Two things keep the app from reading the same games again:
 * - a month in `done` is skipped, and so is everything older;
 * - every request lets the browser check its copy with the site (`cache: 'no-cache'`). The site
 *   answers an unchanged month with an empty 304 (checked against api.chess.com, 2026-11-15). The
 *   app cannot send the ETag itself: the site's CORS rules allow no such header and hide the ETag.
 *
 * `closed` names the months read that are over, for the caller to add to `done` once it has
 * stored their games.
 */
export async function fetchChessComRecent(
  username: string,
  options: RecentOptions = {},
): Promise<{ result: ImportResult; closed: string[] }> {
  const minGames = options.minGames ?? 50;
  const now = options.now ?? Date.now();
  const done = new Set(options.done ?? []);
  const name = encodeURIComponent(username.trim().toLowerCase());
  const request = { ...options, cache: 'no-cache' as const };
  const fail = (result: ImportResult) => ({ result, closed: [] });

  const raw: ChessComGame[] = [];
  const read: string[] = [];
  const list = await siteGetJson<{ archives?: unknown }>(
    `https://api.chess.com/pub/player/${name}/games/archives`,
    request,
  );
  if (!list.ok) return fail(list);
  if (!list.body) return fail(httpFailure(list.status));
  const archives = Array.isArray(list.body.archives)
    ? list.body.archives.filter(
        (url): url is string => typeof url === 'string' && url.startsWith('https://api.chess.com/'),
      )
    : [];
  if (archives.length === 0) return fail(failure('no-games'));

  for (let i = 1; i <= Math.min(2, archives.length); i++) {
    const url = archives[archives.length - i]!;
    if (done.has(url)) break; // stored already, and so is what came before it
    const month = await siteGetJson<{ games?: unknown }>(url, request);
    if (!month.ok) return fail(month);
    if (!month.body) return fail(httpFailure(month.status, false));
    const games = Array.isArray(month.body.games) ? (month.body.games as ChessComGame[]) : [];
    raw.push(...games);
    read.push(url);
    if (games.length >= minGames) break;
  }
  const closed = read.filter((url) => archiveClosed(url, now));
  if (read.length === 0) return { result: { ok: true, games: [], skipped: 0 }, closed };

  raw.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));
  const games: GameRecord[] = [];
  let skipped = 0;
  for (const game of raw) {
    const rec = toRecord(game);
    if (rec) games.push(rec);
    else skipped++;
  }
  if (games.length === 0) {
    return { result: failure('no-games', skipped > 0 ? `${skipped} skipped` : null), closed };
  }
  return { result: { ok: true, games, skipped }, closed };
}

/** `fetchChessComRecent` without the stored months: everything recent (Search, `importGames`). */
export async function fetchChessComGames(
  username: string,
  options: FetchOptions & { minGames?: number } = {},
): Promise<ImportResult> {
  return (await fetchChessComRecent(username, options)).result;
}
