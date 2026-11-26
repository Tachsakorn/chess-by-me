/**
 * One Chess.com game from its link (1.2), through the public Published-Data API only.
 *
 * That API has no "game by id": games are filed by player and by the month they ended
 * (GET https://api.chess.com/pub/player/{name}/games/{YYYY}/{MM}). So a link is opened through a
 * player of the game: the name in the link (`?username=`), the user's own Chess.com account, or a
 * name the user types. Their months are read from the newest, and the game is the one whose `url`
 * holds the link's id.
 *
 * Live game ids grow with time (checked on two real months, the fixtures: every live id of
 * 2026/11 is above every one of 2026/10), so once a month's live games are all older than the link, the
 * game is not in that player's archives and the search stops. Daily ids are when a game started,
 * and a daily game can last weeks, so daily searches read up to MAX_MONTHS.
 */
import type { ImportResult } from '@/contract';
import { toRecord, type ChessComGame } from './chesscom';
import { failure, httpFailure, type FetchOptions } from './errors';
import { siteGetJson } from './http';

export type ChessComKind = 'live' | 'daily';
export interface ChessComGameId {
  kind: ChessComKind;
  id: string;
}

/** Daily games: months read back per player at most. */
export const MAX_MONTHS = 24;
/** Live games: months read per player at most (a binary search needs about log2 of the months). */
export const MAX_READS = 16;

/**
 * The game id in a Chess.com address: /game/live/{id}, /game/daily/{id}, the older
 * /live/game/{id} and /daily/game/{id}, and /analysis/game/live/{id}. Null for anything else.
 */
export function gameIdOf(url: string): ChessComGameId | null {
  const match =
    /\/game\/(live|daily)\/(\d+)(?:[/?#]|$)/.exec(url) ??
    /\/(live|daily)\/game\/(\d+)(?:[/?#]|$)/.exec(url);
  return match ? { kind: match[1] as ChessComKind, id: match[2]! } : null;
}

function sameGame(game: ChessComGame, wanted: ChessComGameId): boolean {
  const found = game.url ? gameIdOf(game.url) : null;
  return found !== null && found.kind === wanted.kind && found.id === wanted.id;
}

type Search = { found: ImportResult } | { notHere: 'user-not-found' | 'no-games' };

async function searchPlayer(
  wanted: ChessComGameId,
  username: string,
  options: FetchOptions,
): Promise<Search> {
  const name = encodeURIComponent(username);
  const list = await siteGetJson<{ archives?: unknown }>(
    `https://api.chess.com/pub/player/${name}/games/archives`,
    options,
  );
  if (!list.ok) return { found: list };
  if (!list.body) {
    return list.status === 404
      ? { notHere: 'user-not-found' }
      : { found: httpFailure(list.status) };
  }
  const archives = Array.isArray(list.body.archives)
    ? list.body.archives.filter(
        (url): url is string => typeof url === 'string' && url.startsWith('https://api.chess.com/'),
      )
    : [];
  const target = BigInt(wanted.id);

  // Each month read once; a failure ends the whole search.
  const read = new Map<number, ChessComGame[]>();
  let failed: ImportResult | null = null;
  const month = async (i: number): Promise<ChessComGame[] | null> => {
    const known = read.get(i);
    if (known) return known;
    const got = await siteGetJson<{ games?: ChessComGame[] }>(archives[i]!, options);
    if (!got.ok) failed = got;
    else if (!got.body) failed = httpFailure(got.status, false);
    if (failed) return null;
    const games = got.ok && Array.isArray(got.body?.games) ? got.body.games : [];
    read.set(i, games);
    return games;
  };
  const found = (games: ChessComGame[]): ImportResult | null => {
    const game = games.find((g) => sameGame(g, wanted));
    if (!game) return null;
    const record = toRecord(game);
    return record
      ? { ok: true, games: [record], skipped: 0 }
      : failure('invalid-pgn', 'not a standard game');
  };
  /** Where the link stands against a month's live games: older, newer, or within. */
  const place = (games: ChessComGame[]): 'older' | 'newer' | 'within' | null => {
    const ids = games
      .map((g) => (g.url ? gameIdOf(g.url) : null))
      .filter((g): g is ChessComGameId => g?.kind === 'live')
      .map((g) => BigInt(g.id));
    if (ids.length === 0) return null;
    if (ids.every((id) => id > target)) return 'older';
    if (ids.every((id) => id < target)) return 'newer';
    return 'within';
  };
  const look = async (i: number): Promise<Search | 'older' | 'newer' | 'within' | null> => {
    const games = await month(i);
    if (!games) return { found: failed! };
    const result = found(games);
    return result ? { found: result } : wanted.kind === 'live' ? place(games) : null;
  };

  if (wanted.kind === 'daily') {
    // Daily ids are when a game started, not when it ended: read back month by month.
    for (let i = archives.length - 1; i >= Math.max(0, archives.length - MAX_MONTHS); i--) {
      const seen = await look(i);
      if (seen && typeof seen === 'object') return seen;
    }
    return { notHere: 'no-games' };
  }

  // Live: the newest month first (most links are recent games), then a binary search over the
  // older months by id. A month without live games is stepped over towards the older end.
  let hi = archives.length - 1;
  let lo = 0;
  while (lo <= hi && read.size < MAX_READS) {
    const first = hi === archives.length - 1 && !read.has(hi);
    const start = first ? hi : (lo + hi) >> 1;
    let mid = start;
    let seen = await look(mid);
    while (seen === null && mid > lo && read.size < MAX_READS) seen = await look(--mid);
    if (seen && typeof seen === 'object') return seen;
    if (seen === null) {
      // No live game from mid up to start: the game is newer than start, if anywhere.
      if (mid > lo) break; // stopped by MAX_READS
      lo = start + 1;
    } else if (seen === 'newer') {
      if (first) break; // newer than the newest month: not in the archives (yet)
      lo = mid + 1;
    } else if (seen === 'older') {
      hi = mid - 1;
    } else {
      // Within the month's ids but not filed there: a game is filed under the month it ended
      // in, so it can sit in a month next to it.
      for (const next of [mid + 1, mid - 1]) {
        if (next < 0 || next >= archives.length) continue;
        const near = await look(next);
        if (near && typeof near === 'object') return near;
      }
      break;
    }
  }
  return { notHere: 'no-games' };
}

/**
 * Fetches the game `wanted` through each of `usernames` in turn (blank and repeated names are
 * left out). `user-not-found` when none of them is a Chess.com player, `no-games` when the game
 * is in none of their archives; a network or site failure ends the search at once.
 */
export async function fetchChessComGame(
  wanted: ChessComGameId,
  usernames: readonly string[],
  options: FetchOptions = {},
): Promise<ImportResult> {
  const names = [...new Set(usernames.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  let anyPlayer = false;
  for (const name of names) {
    const search = await searchPlayer(wanted, name, options);
    if ('found' in search) return search.found;
    if (search.notHere === 'no-games') anyPlayer = true;
  }
  return anyPlayer
    ? failure('no-games', 'game not in the archives read')
    : failure('user-not-found', names.length === 0 ? 'no name to search' : null);
}
