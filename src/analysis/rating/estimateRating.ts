import type { RatingRange, TimeClass } from '@/contract';
import calibration from './calibration.json';
import { rangeFromTable, type CalibrationBucket } from './rangeFromTable';

/**
 * Estimated rating as a range, from one player's accuracy in one game.
 *
 * The range comes from a table measured on real games (see docs/CALIBRATION.md):
 * the middle 60 % of the ratings of players who reached that accuracy. It is a
 * Lichess-scale rating and deliberately wide; one game says little about a player.
 */

/** Below this many moves by the player there is too little to go on. */
const MIN_PLAYER_MOVES = 10;

const TABLES: Record<string, readonly CalibrationBucket[] | undefined> = calibration.tables;

export interface RatingEstimateInput {
  /** The player's game accuracy, 0..100. */
  accuracy: number;
  /** Time class of the game; null when unknown. */
  timeClass: TimeClass | null;
  /** How many moves this player made. */
  playerMoves: number;
}

export function estimateRating(input: RatingEstimateInput): RatingRange | null {
  if (input.playerMoves < MIN_PLAYER_MOVES || !Number.isFinite(input.accuracy)) return null;
  // A time class without enough calibration data has no table of its own.
  const table = (input.timeClass ? TABLES[input.timeClass] : undefined) ?? TABLES.all;
  if (!table || table.length === 0) return null;
  return rangeFromTable(table, input.accuracy);
}
