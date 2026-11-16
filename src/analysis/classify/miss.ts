/**
 * Miss: the opponent has just made a mistake and the reply let the chance go.
 *
 * This rule is this project's own. WintrChess (commit d145b2096895) has no
 * such class; the idea follows the category of the same name on Chess.com as
 * the project brief asks. The two numbers below are built from WintrChess's
 * ladder so that no new scale is introduced; the reasoning is written out in
 * docs/sources/classification.md.
 */
import type { LadderCategory } from './categories';
import { AT_LEAST_EQUAL_EXPECTED } from './expectedPoints';

/**
 * Expected points the mover must have had before the move for a chance to
 * count as "missed": a level game (0.5) plus the mistake threshold (0.12).
 * About +140 centipawns.
 */
export const MISS_MIN_EXPECTED_BEFORE = 0.62;

/**
 * Over the opponent's mistake and the reply together, the mover must have lost
 * less than this (the inaccuracy threshold of the ladder). Otherwise the reply
 * gave away more than it was given and is an error in its own right.
 */
export const MISS_MAX_NET_LOSS = 0.08;

/**
 * After the reply the mover must still be at least equal (Fable review A1-04, 2026-11-15): when
 * both sides trade blunders, a reply that leaves the mover lost is an error in its own right.
 * The same floor as a Brilliant move.
 */
export const MISS_MIN_EXPECTED_AFTER = AT_LEAST_EQUAL_EXPECTED;

export interface MissInput {
  /** What the ladder rules call the move. */
  category: LadderCategory;
  /** What the ladder rules call the opponent's move just before; null when it does not count. */
  opponentPrevious: LadderCategory | null;
  /** The mover's expected points before the opponent's previous move. */
  moverBeforeOpponentMove: number;
  /** The mover's expected points before the move. */
  moverBefore: number;
  /** The mover's expected points after the move. */
  moverAfter: number;
}

const isError = (category: LadderCategory | null): boolean =>
  category === 'mistake' || category === 'blunder';

/**
 * Whether a mistake or blunder should be called a Miss instead: the opponent's
 * previous move was itself a mistake or blunder, it left the mover clearly
 * better, and the reply returned the gift without losing more than that and
 * without leaving the mover worse than equal.
 */
export function isMiss(input: MissInput): boolean {
  return (
    isError(input.category) &&
    isError(input.opponentPrevious) &&
    input.moverBefore >= MISS_MIN_EXPECTED_BEFORE &&
    input.moverAfter >= MISS_MIN_EXPECTED_AFTER &&
    input.moverBeforeOpponentMove - input.moverAfter < MISS_MAX_NET_LOSS
  );
}
