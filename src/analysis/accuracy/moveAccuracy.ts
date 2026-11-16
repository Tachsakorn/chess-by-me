/**
 * Accuracy of one move, 0..100, from the mover's win percentage before and
 * after it. Lichess's exponential curve (see docs/sources/accuracy-rating.md).
 */

const CURVE_SCALE = 103.1668100711649;
const CURVE_DECAY = 0.04354415386753951;
const CURVE_OFFSET = -3.166924740191411;
/** Lichess adds one point to every lossy move for imperfect analysis. */
const UNCERTAINTY_BONUS = 1;

export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100;
  const loss = winBefore - winAfter;
  const raw = CURVE_SCALE * Math.exp(-CURVE_DECAY * loss) + CURVE_OFFSET + UNCERTAINTY_BONUS;
  return Math.min(100, Math.max(0, raw));
}
