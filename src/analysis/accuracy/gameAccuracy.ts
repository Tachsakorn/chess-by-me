import type { Color, PositionEval } from '@/contract';
import { moveAccuracy } from './moveAccuracy';
import { winPercent } from './winPercent';

/**
 * Game accuracy per player, following Lichess's published method
 * (https://lichess.org/page/accuracy; details in docs/sources/accuracy-rating.md):
 * each move's accuracy is weighted by how volatile the game was around it
 * (standard deviation of win% over a short window), and the player's result is
 * the average of that weighted mean and the plain harmonic mean of the moves.
 */

/** Window length is one tenth of the game, kept within these bounds. */
const MIN_WINDOW = 2;
const MAX_WINDOW = 8;
/** Bounds on each move's volatility weight. */
const MIN_WEIGHT = 0.5;
const MAX_WEIGHT = 12;
/** The harmonic mean treats accuracies below this as this, to avoid dividing by zero. */
const HARMONIC_FLOOR = 1;
/** Accuracy of a side that made no moves (Lichess reports none; see the sources doc). */
const NO_MOVES_ACCURACY = 100;

export interface GameAccuracy {
  /** Accuracy of each move, 0..100, in game order. */
  perMove: number[];
  white: number;
  black: number;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

function populationStdDev(values: readonly number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * @param positions one per position, `positions.length === colors.length + 1`
 * @param colors `colors[i]` is the side that played move `i + 1`
 */
export function computeAccuracy(
  positions: readonly PositionEval[],
  colors: readonly Color[],
): GameAccuracy {
  if (positions.length !== colors.length + 1) {
    throw new Error(
      `computeAccuracy: expected ${colors.length + 1} positions for ${colors.length} moves, got ${positions.length}`,
    );
  }

  // White's win% in every position.
  const wins = positions.map((p) => winPercent(p.score));
  const windowSize = clamp(Math.floor((wins.length - 1) / 10), MIN_WINDOW, MAX_WINDOW);

  const perMove: number[] = [];
  const byColor: Record<Color, { accuracy: number; weight: number }[]> = { white: [], black: [] };

  colors.forEach((color, i) => {
    const whiteBefore = wins[i] ?? 50;
    const whiteAfter = wins[i + 1] ?? 50;
    const accuracy =
      color === 'white'
        ? moveAccuracy(whiteBefore, whiteAfter)
        : moveAccuracy(100 - whiteBefore, 100 - whiteAfter);
    perMove.push(accuracy);

    // The window holds `windowSize` positions and ends just after this move;
    // early moves, which have too little history, share the opening window.
    const start = Math.max(0, i + 2 - windowSize);
    const window = wins.slice(start, start + windowSize);
    const weight = clamp(populationStdDev(window), MIN_WEIGHT, MAX_WEIGHT);
    byColor[color].push({ accuracy, weight });
  });

  return { perMove, white: sideAccuracy(byColor.white), black: sideAccuracy(byColor.black) };
}

function sideAccuracy(moves: readonly { accuracy: number; weight: number }[]): number {
  if (moves.length === 0) return NO_MOVES_ACCURACY;
  let weightedSum = 0;
  let weightTotal = 0;
  let inverseSum = 0;
  for (const { accuracy, weight } of moves) {
    weightedSum += accuracy * weight;
    weightTotal += weight;
    inverseSum += 1 / Math.max(HARMONIC_FLOOR, accuracy);
  }
  const weightedMean = weightedSum / weightTotal;
  const harmonicMean = moves.length / inverseSum;
  return clamp((weightedMean + harmonicMean) / 2, 0, 100);
}
