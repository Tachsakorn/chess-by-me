/**
 * Expected points: how many points (0..1) White can expect from a position.
 *
 * Method and constant follow WintrChess (GPL-3.0, WintrCat/wintrchess at
 * commit d145b2096895, shared/src/lib/reporter/expectedPoints.ts). The code
 * here is written for this project's `Score` type; nothing is copied.
 * See docs/sources/classification.md.
 */
import type { Color, Score } from '@/contract';

/** Steepness of the logistic curve per centipawn (WintrChess's default `centipawnGradient`). */
export const CENTIPAWN_GRADIENT = 0.0035;

/** White's expected points, 0..1. A forced mate or a won game counts as certain. */
export function expectedPoints(score: Score): number {
  switch (score.kind) {
    case 'cp':
      return 1 / (1 + Math.exp(-CENTIPAWN_GRADIENT * score.value));
    case 'mate':
      return score.winner === 'white' ? 1 : 0;
    case 'over':
      if (score.winner === null) return 0.5;
      return score.winner === 'white' ? 1 : 0;
  }
}

/**
 * "At least equal": no more than an excellent move's worth (0.045) below a level game, about
 * -52 cp. Used by the throws-away-advantage tag and, since 2026-11-15, as the floor of a
 * Brilliant move (see docs/sources/classification.md).
 */
export const AT_LEAST_EQUAL_EXPECTED = 0.455;

/** Expected points from the point of view of `color`. */
export function expectedPointsFor(score: Score, color: Color): number {
  const forWhite = expectedPoints(score);
  return color === 'white' ? forWhite : 1 - forWhite;
}

/** The expected points the mover gave up between two positions; never below 0. */
export function pointLoss(before: Score, after: Score, mover: Color): number {
  return Math.max(0, expectedPointsFor(before, mover) - expectedPointsFor(after, mover));
}
