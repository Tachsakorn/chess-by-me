/**
 * The evaluation bar beside the review board (owner, 2026-11-15): White's share of the bar is
 * White's win chance (`whiteExpected`, worked out by src/analysis with the same function the
 * move categories use), not the raw score, so a forced mate or a mated game fills it.
 */
import type { PositionEval } from '@/contract';
import { formatScore } from './model';

export interface EvalBarState {
  /** False until this position is analysed: the bar then waits at the middle, faded. */
  ready: boolean;
  /** White's share of the bar, 0..1. */
  white: number;
  leader: 'white' | 'black' | 'equal' | null;
  /** The figure the iPad bar shows ("+2.5", "−#3"); null when not ready. */
  text: string | null;
}

const MINUS = '−';

export function evalBar(position: PositionEval | undefined): EvalBarState {
  if (!position) return { ready: false, white: 0.5, leader: null, text: null };
  const { score, whiteExpected } = position;
  let text = formatScore(score);
  let leader: EvalBarState['leader'];
  if (score.kind === 'cp') {
    const tenths = Math.round(score.value / 10);
    leader = tenths === 0 ? 'equal' : tenths > 0 ? 'white' : 'black';
    // From ten pawns up, whole pawns: "+12.3" would not fit the 20px bar.
    if (Math.abs(tenths) >= 100) {
      const pawns = Math.round(Math.abs(score.value) / 100);
      text = `${score.value > 0 ? '+' : MINUS}${pawns}`;
    }
  } else {
    leader = score.winner ?? 'equal';
  }
  return { ready: true, white: whiteExpected, leader, text };
}
