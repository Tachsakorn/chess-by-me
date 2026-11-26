/**
 * What the Home and My Games screens say about games, worked out from stored records. No chess
 * evaluation here: only who played, how it ended, when, and where the user stopped.
 */
import type { Color, GameRecord, MoveCategory, TimeClass } from '@/contract';
import type { RatingsShown, ReviewProgress } from '@/data/local';
import { RATED_CLASSES, type AccountSource, type Ratings } from '@/data/ratings';
import type { Locale } from '@/i18n';

export type Outcome = 'win' | 'loss' | 'draw';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function userSide(game: GameRecord, username: string): Color | null {
  if (same(game.white.name, username)) return 'white';
  if (same(game.black.name, username)) return 'black';
  return null;
}

/** The result seen from the user's side; null for an unfinished game or someone else's. */
export function outcomeFor(game: GameRecord, username: string): Outcome | null {
  const side = userSide(game, username);
  if (!side || game.result === '*') return null;
  if (game.result === '1/2-1/2') return 'draw';
  const whiteWon = game.result === '1-0';
  return whiteWon === (side === 'white') ? 'win' : 'loss';
}

export function opponentOf(game: GameRecord, username: string): string {
  return userSide(game, username) === 'black' ? game.white.name : game.black.name;
}

export function timeClassOf(game: GameRecord): TimeClass | null {
  return game.timeControl?.timeClass ?? null;
}

/** The colour shown at the bottom of a board: the user's, or White for someone else's game. */
export function boardSide(game: GameRecord, username: string | null): Color {
  return (username && userSide(game, username)) || 'white';
}

/** The last position of a game and the move that led to it. */
export function finalPosition(game: GameRecord): { fen: string; lastMove: string | null } {
  const last = game.moves.at(-1);
  return last
    ? { fen: last.fenAfter, lastMove: last.uci }
    : { fen: game.initialFen, lastMove: null };
}

export function positionAt(
  game: GameRecord,
  ply: number,
): { fen: string; lastMove: string | null } {
  const move = ply > 0 ? game.moves[ply - 1] : undefined;
  return move
    ? { fen: move.fenAfter, lastMove: move.uci }
    : { fen: game.initialFen, lastMove: null };
}

/** The mark written after a move (BRIEF-UI 6.2). */
export const CATEGORY_MARK: Record<MoveCategory, string> = {
  brilliant: '!!',
  great: '!',
  best: '',
  excellent: '',
  good: '',
  book: '',
  inaccuracy: '?!',
  mistake: '?',
  miss: '', // owner, 2026-11-15: the cross is the Miss badge's only, never after the move
  blunder: '??',
};

/** "8... d5?" or "8. h3!" for move `ply` (1-based). */
export function moveLabel(game: GameRecord, ply: number, category?: MoveCategory): string {
  const move = game.moves[ply - 1];
  if (!move) return '';
  const number = move.color === 'white' ? `${move.moveNumber}.` : `${move.moveNumber}...`;
  return `${number} ${move.san}${category ? CATEGORY_MARK[category] : ''}`;
}

// ---- ratings ---------------------------------------------------------------------------------

/**
 * The ratings to show: Lichess gives its own change figure; Chess.com does not, so the change is
 * measured against the ratings saved at the previous visit.
 */
export function ratingsToShow(
  source: AccountSource,
  current: Ratings,
  previous: RatingsShown | null,
): RatingsShown {
  const out = {} as RatingsShown;
  for (const speed of RATED_CLASSES) {
    const { rating, progress } = current[speed];
    let change: number | null = null;
    if (rating !== null) {
      if (source === 'lichess') change = progress;
      else {
        const before = previous?.[speed].rating ?? null;
        change = before === null ? null : rating - before;
      }
    }
    out[speed] = { rating, change };
  }
  return out;
}

// ---- lists ------------------------------------------------------------------------------------

export type GroupKey = { kind: 'thisWeek' } | { kind: 'lastWeek' } | { kind: 'month'; date: Date };

export interface GameGroup {
  id: string;
  key: GroupKey;
  games: GameRecord[];
}

/** Monday 00:00, local time, of the week holding `date`. */
function weekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/** Games (newest first) under "This week", "Last week", then one heading per month. */
export function groupByTime(games: readonly GameRecord[], now: Date): GameGroup[] {
  const thisWeek = weekStart(now).getTime();
  const lastWeek = thisWeek - 7 * 24 * 3600 * 1000;
  const groups: GameGroup[] = [];
  for (const game of games) {
    const parsed = game.playedAt ? new Date(game.playedAt) : null;
    // A date the browser cannot read is no date, never an error (Fable review 1.1 B4-04).
    const played = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    let id: string;
    let key: GroupKey;
    if (played && played.getTime() >= thisWeek) {
      id = 'this-week';
      key = { kind: 'thisWeek' };
    } else if (played && played.getTime() >= lastWeek) {
      id = 'last-week';
      key = { kind: 'lastWeek' };
    } else {
      const month = played ?? new Date(0);
      id = `${month.getFullYear()}-${month.getMonth()}`;
      key = { kind: 'month', date: new Date(month.getFullYear(), month.getMonth(), 1) };
    }
    const last = groups.at(-1);
    if (last && last.id === id) last.games.push(game);
    else groups.push({ id, key, games: [game] });
  }
  return groups;
}

// ---- the Continue card ------------------------------------------------------------------------

export type ContinueCard =
  | { kind: 'paused'; game: GameRecord; ply: number }
  | { kind: 'latest'; game: GameRecord }
  | { kind: 'notAnalyzed'; game: GameRecord };

/**
 * BRIEF-UI 6.1, item 4: the game the user left most recently before its last move; else the
 * newest analysed game; else the newest game. Null when there are no games.
 */
export function pickContinue(
  games: readonly GameRecord[],
  analyzed: ReadonlySet<string>,
  progress: Readonly<Record<string, ReviewProgress>>,
): ContinueCard | null {
  let paused: { game: GameRecord; ply: number; at: number } | null = null;
  for (const game of games) {
    const left = progress[game.id];
    if (!left || left.ply < 1 || left.ply >= game.moves.length) continue;
    if (!paused || left.at > paused.at) paused = { game, ply: left.ply, at: left.at };
  }
  if (paused) return { kind: 'paused', game: paused.game, ply: paused.ply };
  const latest = games.find((game) => analyzed.has(game.id));
  if (latest) return { kind: 'latest', game: latest };
  const newest = games[0];
  return newest ? { kind: 'notAnalyzed', game: newest } : null;
}

// ---- formatting -----------------------------------------------------------------------------

/** Thai dates in the Gregorian calendar with Arabic digits (BRIEF-UI section 7). */
export function intlLocale(locale: Locale): string {
  return locale === 'th' ? 'th-TH-u-ca-gregory-nu-latn' : 'en-US';
}

export function formatAccuracy(value: number): string {
  return value.toFixed(1);
}

/**
 * A side's accuracy as shown everywhere (review, My Games, the Continue card): `noValue` (a dash)
 * for a side that made no move, whose accuracy says nothing (Fable review A1-07, owner 1.1
 * round 2), or while it is not known yet.
 */
export function sideAccuracy(
  value: number | undefined,
  game: GameRecord,
  side: Color,
  noValue: string,
): string {
  if (value === undefined || !game.moves.some((move) => move.color === side)) return noValue;
  return formatAccuracy(value);
}

export function formatToday(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatShortDate(iso: string | null, locale: Locale): string {
  const date = iso ? new Date(iso) : null;
  // A date the browser cannot read shows as no date (Fable review 1.1 B4-04).
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', day: 'numeric' }).format(
    date,
  );
}

export function formatMonth(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', year: 'numeric' }).format(
    date,
  );
}
