import type { Score } from '@/contract';

/**
 * Chance of winning, 0..100, as Lichess models it from a centipawn score.
 * Method and constants: Lichess's win% model (see docs/sources/accuracy-rating.md).
 */

/** Logistic slope fitted by Lichess to game outcomes by rating. */
const SLOPE = 0.00368208;
/** Scores beyond this many centipawns count as this many. */
const CP_CAP = 1000;

/** White's chance of winning (0..100) for a centipawn score from White's side. */
export function winPercentFromCp(cp: number): number {
  const capped = Math.min(CP_CAP, Math.max(-CP_CAP, cp));
  const chances = 2 / (1 + Math.exp(-SLOPE * capped)) - 1;
  return 50 + 50 * Math.min(1, Math.max(-1, chances));
}

/**
 * White's chance of winning (0..100) for any score. A forced mate and a
 * finished game count as the capped centipawn score for the winning side,
 * as Lichess does; a drawn finish counts as 0 cp.
 */
export function winPercent(score: Score): number {
  switch (score.kind) {
    case 'cp':
      return winPercentFromCp(score.value);
    case 'mate':
      return winPercentFromCp(score.winner === 'white' ? CP_CAP : -CP_CAP);
    case 'over':
      if (score.winner === null) return winPercentFromCp(0);
      return winPercentFromCp(score.winner === 'white' ? CP_CAP : -CP_CAP);
  }
}
