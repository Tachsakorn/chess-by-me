/**
 * Finding games that are not the user's own (BRIEF-UI 6.5, Search): reading a game link,
 * fetching that one game, and looking players up on both sites. Added for the redesign as its
 * own module; the import code is untouched (its PGN reader is reused).
 *
 * - Lichess one game: GET https://lichess.org/game/export/{id}?pgnInJson=true&clocks=true
 *   with Accept: application/json, the same shape as one line of the games export.
 * - Lichess names: GET https://lichess.org/api/player/autocomplete?term=..&object=true
 * - Chess.com names: GET https://api.chess.com/pub/player/{username} (exact names only: the
 *   Published-Data API has no search).
 * - Chess.com one game (1.2): its public API has no game by id, so a link is opened through a
 *   player's monthly archives (chesscomGame.ts).
 */
import type { GameRecord, ImportError, ImportResult, Termination } from '@/contract';
import { fetchChessComGame, gameIdOf, type ChessComKind } from './chesscomGame';
import { failure, httpFailure, type Failed, type FetchOptions } from './errors';
import { siteGetJson } from './http';
import { gameFromPgn, parsePgn } from './pgn';
import type { AccountSource } from './ratings';

export type GameLink =
  | { source: 'lichess'; id: string }
  | {
      source: 'chesscom';
      id: string;
      kind: ChessComKind;
      /** The player a shared link names (`?username=`): the first whose games are read. */
      username: string | null;
    };

/** Lichess paths that are pages, not games. */
const LICHESS_PAGES = new Set([
  'training',
  'analysis',
  'tournament',
  'study',
  'broadcast',
  'editor',
]);

export function parseGameLink(text: string): GameLink | null {
  let url: URL;
  try {
    const trimmed = text.trim();
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  if (host === 'lichess.org') {
    const first = parts[0] ?? '';
    // A game id is 8 characters; the 12-character form adds the player's side.
    if (/^[A-Za-z0-9]{8}([A-Za-z0-9]{4})?$/.test(first) && !LICHESS_PAGES.has(first)) {
      return { source: 'lichess', id: first.slice(0, 8) };
    }
    return null;
  }
  if (host === 'chess.com') {
    const game = gameIdOf(url.pathname);
    const username = url.searchParams.get('username')?.trim() || null;
    if (game) return { source: 'chesscom', ...game, username };
  }
  return null;
}

/**
 * The first game link inside a longer text, as apps share it: "Check out this game:
 * https://www.chess.com/game/live/123?username=a" (1.2, Web Share Target). Null when there is none.
 */
export function findGameLink(text: string): GameLink | null {
  const whole = parseGameLink(text);
  if (whole) return whole;
  for (const word of text.split(/\s+/)) {
    const link = /(lichess\.org|chess\.com)\//i.test(word)
      ? parseGameLink(word.replace(/[)\].,!?'"]+$/, ''))
      : null;
    if (link) return link;
  }
  return null;
}

interface LichessGameJson {
  id?: string;
  rated?: boolean;
  variant?: string;
  status?: string;
  createdAt?: number;
  winner?: string;
  players?: { white?: { rating?: number }; black?: { rating?: number } };
  pgn?: string;
}

const STATUS_TERMINATION: Record<string, Termination> = {
  mate: 'checkmate',
  resign: 'resignation',
  stalemate: 'stalemate',
  outoftime: 'timeout',
  timeout: 'abandonment',
};

/**
 * Fetches the game of a link. A Chess.com game is looked for in the archives of the player the
 * link names, then of `players` (the user's own account, a name they typed), in that order.
 */
export async function fetchGameByLink(
  link: GameLink,
  options: FetchOptions = {},
  players: readonly string[] = [],
): Promise<ImportResult> {
  if (link.source === 'chesscom') {
    return fetchChessComGame(
      { kind: link.kind, id: link.id },
      [link.username ?? '', ...players],
      options,
    );
  }
  const got = await siteGetJson<LichessGameJson>(
    `https://lichess.org/game/export/${link.id}?pgnInJson=true&clocks=true&opening=true`,
    options,
  );
  if (!got.ok) return got;
  const body = got.body;
  if (!body) return httpFailure(got.status);
  if (body.variant !== 'standard' || typeof body.pgn !== 'string') {
    return failure('invalid-pgn', 'not a standard game');
  }
  const termination =
    body.status === 'outoftime' && body.winner === undefined
      ? 'timeout-vs-insufficient-material'
      : body.status
        ? STATUS_TERMINATION[body.status]
        : undefined;
  const game = gameFromPgn(body.pgn, {
    id: `lichess:${link.id}`,
    source: 'lichess',
    sourceUrl: `https://lichess.org/${link.id}`,
    playedAt:
      typeof body.createdAt === 'number'
        ? new Date(body.createdAt).toISOString().replace(/\.\d{3}Z$/, 'Z')
        : null,
    rated: typeof body.rated === 'boolean' ? body.rated : null,
    whiteRating: body.players?.white?.rating ?? null,
    blackRating: body.players?.black?.rating ?? null,
    ...(termination ? { termination } : {}),
  });
  return game ? { ok: true, games: [game], skipped: 0 } : failure('invalid-pgn', 'unreadable');
}

export type PasteOutcome =
  | { kind: 'game'; game: GameRecord }
  /** Not fetched here: the screen knows whose archives to read (fetchGameByLink). */
  | { kind: 'chesscom-link'; link: Extract<GameLink, { source: 'chesscom' }> }
  | { kind: 'not-a-game' }
  | { kind: 'failed'; error: ImportError };

/**
 * What a pasted text is, decided on the device (Fable review A2-01). Only a Lichess game link
 * leads to a request, and only to Lichess; a PGN is read here; anything else (a code, a phone
 * number, a password) is never sent anywhere.
 */
export async function openPasted(text: string, options: FetchOptions = {}): Promise<PasteOutcome> {
  const link = parseGameLink(text);
  if (link?.source === 'chesscom') return { kind: 'chesscom-link', link };
  if (link) {
    const result = await fetchGameByLink(link, options);
    if (!result.ok) return { kind: 'failed', error: result.error };
    const game = result.games[0];
    return game
      ? { kind: 'game', game }
      : { kind: 'failed', error: { code: 'invalid-pgn', detail: null } };
  }
  const pgn = parsePgn(text);
  const game = pgn.ok ? pgn.games[0] : undefined;
  return game ? { kind: 'game', game } : { kind: 'not-a-game' };
}

export interface PlayerHit {
  source: AccountSource;
  username: string;
  title: string | null;
}

export type SearchResult =
  { ok: true; lichess: PlayerHit[]; chesscom: PlayerHit[] } | { ok: false; error: ImportError };

type Lookup = { ok: true; hits: PlayerHit[] } | Failed;

async function lichessNames(term: string, options: FetchOptions): Promise<Lookup> {
  const got = await siteGetJson<{ result?: { name?: unknown; title?: unknown }[] }>(
    `https://lichess.org/api/player/autocomplete?term=${encodeURIComponent(term)}&object=true`,
    options,
  );
  if (!got.ok) return got;
  // The bare error, as every other lookup gives it (Fable review A4-03).
  if (!got.body) return httpFailure(got.status, false);
  const hits = (Array.isArray(got.body.result) ? got.body.result : []).flatMap((r) =>
    typeof r.name === 'string'
      ? [
          {
            source: 'lichess' as const,
            username: r.name,
            title: typeof r.title === 'string' ? r.title : null,
          },
        ]
      : [],
  );
  return { ok: true, hits };
}

async function chessComName(name: string, options: FetchOptions): Promise<Lookup> {
  const got = await siteGetJson<{ username?: unknown; title?: unknown }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(name.toLowerCase())}`,
    options,
  );
  if (!got.ok) return got;
  if (got.status === 404) return { ok: true, hits: [] };
  if (!got.body) return httpFailure(got.status);
  const body = got.body;
  return {
    ok: true,
    hits: [
      {
        source: 'chesscom',
        username: typeof body.username === 'string' ? body.username : name,
        title: typeof body.title === 'string' ? body.title : null,
      },
    ],
  };
}

/** Players named like `text` on both sites. Fails only when neither site answers. */
export async function searchPlayers(
  text: string,
  options: FetchOptions = {},
): Promise<SearchResult> {
  const term = text.trim();
  if (term.length < 2 || !/^[A-Za-z0-9_-]+$/.test(term))
    return { ok: true, lichess: [], chesscom: [] };
  const [lichess, chesscom] = await Promise.all([
    lichessNames(term, options),
    chessComName(term, options),
  ]);
  if (!lichess.ok && !chesscom.ok) return { ok: false, error: lichess.error };
  return {
    ok: true,
    lichess: lichess.ok ? lichess.hits : [],
    chesscom: chesscom.ok ? chesscom.hits : [],
  };
}

export type { GameRecord };
