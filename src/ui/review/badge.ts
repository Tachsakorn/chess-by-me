/**
 * The quality badge on the board of the review screen (owner, 2026-11-15): which categories get
 * one, what it shows, and where it and the Brilliant callout sit. Drawing and animation are in
 * BoardBadge.tsx.
 */
import type { Color, MoveCategory } from '@/contract';
import { CATEGORY_MARK } from '@/ui/model/games';
import { qualityTone, type QualityTone } from './panel';

export interface Badge {
  tone: QualityTone;
  /** The mark in white, or an icon: 'book', 'star' (Best) or 'check' (Excellent, Good). */
  mark: string;
  /** Brilliant only: a white callout with the name rises above the square for a moment. */
  callout: boolean;
}

/** Badge marks that differ from the mark written after a move. */
const ICON_MARKS: Partial<Record<QualityTone, string>> = {
  miss: '×', // the badge only: no mark is written after a Miss (owner, 2026-11-15)
  book: 'book',
  best: 'star',
  excellent: 'check',
  good: 'check',
};

/** Every category has a badge on the board (owner, 2026-11-15, second design). */
export function badgeFor(category: MoveCategory): Badge | null {
  const tone = qualityTone(category);
  if (!tone) return null;
  return {
    tone,
    mark: ICON_MARKS[tone] ?? CATEGORY_MARK[category],
    callout: tone === 'brilliant',
  };
}

/** The categories that have a badge in the move lists, beside Book. */
const LISTED: ReadonlySet<MoveCategory> = new Set([
  'brilliant',
  'great',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
]);

/**
 * The badge a move gets in the move lists (owner, 2026-11-15): the notable categories, and
 * Book on the first and the last move of the opening only; never Best, Excellent or Good.
 * `book` is the first and last book ply, or null when the game has none.
 */
export function listBadge(
  category: MoveCategory,
  ply: number,
  book: { first: number; last: number } | null,
): Badge | null {
  if (category === 'book') {
    return book && (ply === book.first || ply === book.last) ? badgeFor(category) : null;
  }
  return LISTED.has(category) ? badgeFor(category) : null;
}

/** The first and the last ply labelled Book, or null. */
export function bookRange(
  categories: readonly (MoveCategory | undefined)[],
): { first: number; last: number } | null {
  const first = categories.indexOf('book');
  if (first < 0) return null;
  return { first: first + 1, last: categories.lastIndexOf('book') + 1 };
}

export interface BadgeSpot {
  /** 0..7 from the left of the board as it is shown. */
  column: number;
  /** 0..7 from the top of the board as it is shown. */
  row: number;
}

/** The square a move to `square` ("e4") lands on, as shown with `bottom` playing up the screen. */
export function badgeSpot(square: string, bottom: Color): BadgeSpot {
  const file = 'abcdefgh'.indexOf(square[0] ?? 'a');
  const rank = Number(square[1]) - 1;
  return {
    column: bottom === 'white' ? file : 7 - file,
    row: bottom === 'white' ? 7 - rank : rank,
  };
}

/** How far the callout keeps from the edges of the board, in px. */
const EDGE = 4;

/**
 * Where the Brilliant callout goes (px from the board's top left corner): its middle on the
 * middle of the square's top edge, moved in to stay 4px inside the board (owner, 2026-11-15).
 * On the top row that puts it inside the square.
 */
export function calloutPlace(
  spot: BadgeSpot,
  size: { width: number; height: number },
  board: number,
): { left: number; top: number } {
  const square = board / 8;
  const clamp = (value: number, max: number) => Math.min(Math.max(value, EDGE), max);
  return {
    left: clamp((spot.column + 0.5) * square - size.width / 2, board - EDGE - size.width),
    top: clamp(spot.row * square - size.height / 2, board - EDGE - size.height),
  };
}
