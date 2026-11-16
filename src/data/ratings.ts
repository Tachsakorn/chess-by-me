/**
 * A user's current ratings and whether an account exists, for the Home screen and the Connect
 * screen (BRIEF-UI 6.1 and 6.7). Added for the redesign as its own module; the game import code
 * is untouched.
 *
 * Lichess: GET https://lichess.org/api/user/{username}, `perfs.<speed>.rating` and `.prog` (the
 * rating change over the last twelve games). Chess.com: GET
 * https://api.chess.com/pub/player/{username}/stats, `chess_<speed>.last.rating`; Chess.com gives
 * no change figure, so the screen compares with the rating saved at the previous visit.
 */
import { failure, httpFailure, type Failed, type FetchOptions } from './errors';
import { siteGetJson } from './http';

export type AccountSource = 'lichess' | 'chesscom';
export const RATED_CLASSES = ['bullet', 'blitz', 'rapid'] as const;
export type RatedClass = (typeof RATED_CLASSES)[number];

export interface RatingEntry {
  /** Null when the user has not played this speed. */
  rating: number | null;
  /** Change reported by the site; null when it gives none. */
  progress: number | null;
}
export type Ratings = Record<RatedClass, RatingEntry>;

export type RatingsResult = { ok: true; ratings: Ratings } | Failed;
export type AccountResult = { ok: true; username: string } | Failed;

interface LichessPerf {
  games?: number;
  rating?: number;
  prog?: number;
}
interface LichessUser {
  username?: string;
  disabled?: boolean;
  closed?: boolean;
  perfs?: Partial<Record<string, LichessPerf>>;
}
interface ChessComStats {
  [key: string]: { last?: { rating?: number } } | undefined;
}
interface ChessComPlayer {
  username?: string;
  /** "https://www.chess.com/member/SomePlayer": the name with the case the site shows. */
  url?: string;
}

const NONE: RatingEntry = { rating: null, progress: null };

function urlFor(source: AccountSource, username: string, what: 'user' | 'stats'): string {
  const name = encodeURIComponent(username.trim().toLowerCase());
  if (source === 'lichess') return `https://lichess.org/api/user/${name}`;
  return `https://api.chess.com/pub/player/${name}${what === 'stats' ? '/stats' : ''}`;
}

async function getJson<T>(
  url: string,
  options: FetchOptions,
): Promise<{ ok: true; body: T } | Failed> {
  const got = await siteGetJson<T>(url, options);
  if (!got.ok) return got;
  if (!got.body) return httpFailure(got.status);
  return { ok: true, body: got.body };
}

function lichessRatings(user: LichessUser): Ratings {
  const entry = (perf: LichessPerf | undefined): RatingEntry =>
    perf && (perf.games ?? 0) > 0 && typeof perf.rating === 'number'
      ? { rating: perf.rating, progress: typeof perf.prog === 'number' ? perf.prog : null }
      : NONE;
  return {
    bullet: entry(user.perfs?.bullet),
    blitz: entry(user.perfs?.blitz),
    rapid: entry(user.perfs?.rapid),
  };
}

function chessComRatings(stats: ChessComStats): Ratings {
  const entry = (key: string): RatingEntry => {
    const rating = stats[key]?.last?.rating;
    return typeof rating === 'number' ? { rating, progress: null } : NONE;
  };
  return {
    bullet: entry('chess_bullet'),
    blitz: entry('chess_blitz'),
    rapid: entry('chess_rapid'),
  };
}

export async function fetchRatings(
  source: AccountSource,
  username: string,
  options: FetchOptions = {},
): Promise<RatingsResult> {
  if (source === 'lichess') {
    const res = await getJson<LichessUser>(urlFor(source, username, 'user'), options);
    return res.ok ? { ok: true, ratings: lichessRatings(res.body) } : res;
  }
  const res = await getJson<ChessComStats>(urlFor(source, username, 'stats'), options);
  return res.ok ? { ok: true, ratings: chessComRatings(res.body) } : res;
}

/** Whether the site has this user, and the name as the site writes it. */
export async function checkAccount(
  source: AccountSource,
  username: string,
  options: FetchOptions = {},
): Promise<AccountResult> {
  if (username.trim() === '') {
    return failure('user-not-found', 'empty username');
  }
  const res = await getJson<LichessUser & ChessComPlayer>(
    urlFor(source, username, 'user'),
    options,
  );
  if (!res.ok) return res;
  if (res.body.disabled || res.body.closed) {
    return failure('user-not-found', 'account closed');
  }
  if (source === 'chesscom') return { ok: true, username: chessComName(res.body, username.trim()) };
  return { ok: true, username: res.body.username ?? username.trim() };
}

/**
 * Chess.com's API writes the username in lower case; the profile address keeps the case the site
 * shows ("SomePlayer"). Use that when it is the same name, else the name as the user typed it.
 */
function chessComName(player: ChessComPlayer, typed: string): string {
  let fromUrl = '';
  try {
    fromUrl = decodeURIComponent(player.url?.split('/').pop() ?? '');
  } catch {
    // a malformed address: keep the name as typed
  }
  return fromUrl !== '' && fromUrl.toLowerCase() === typed.toLowerCase() ? fromUrl : typed;
}
