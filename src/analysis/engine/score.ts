import type { Score } from '@/contract';
import type { UciScore } from './uci';

/**
 * Converts an engine score (side to move's point of view) into the contract's
 * `Score` (always White's point of view). This is the only place in the
 * package where that flip happens; call it exactly once per score.
 *
 * A UCI mate value is positive when the side to move delivers the mate and
 * negative when it gets mated; the contract stores the distance as a positive
 * number and names the winner.
 */
export function toWhiteScore(score: UciScore, whiteToMove: boolean): Score {
  if (score.kind === 'mate') {
    const moverWins = score.value > 0;
    return {
      kind: 'mate',
      moves: Math.abs(score.value),
      winner: moverWins === whiteToMove ? 'white' : 'black',
    };
  }
  // `0 - x` rather than `-x`: negating zero would give -0, which is not equal
  // to 0 under strict comparison in tests and prints as "-0".
  return { kind: 'cp', value: whiteToMove ? score.value : 0 - score.value };
}
