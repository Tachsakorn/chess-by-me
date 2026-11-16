/**
 * What the review screen shows at a given move, worked out from the game and
 * its reviews. No evaluation maths here: that belongs to src/analysis.
 */
import type { Color, GameRecord, Score } from '@/contract';

/** Where the reader is: `ply` 0 is the starting position, N is after N moves. */
export interface ReviewNavigation {
  ply: number;
  flipped: boolean;
  /** The last action was one step forward ("next"): the board badge then plays its animation. */
  stepped?: boolean;
}

export type NavigationAction = 'first' | 'previous' | 'next' | 'last' | 'flip' | { goTo: number };

export function navigate(
  state: ReviewNavigation,
  action: NavigationAction,
  lastPly: number,
): ReviewNavigation {
  if (action === 'flip') return { ...state, flipped: !state.flipped, stepped: false };
  const target =
    action === 'first'
      ? 0
      : action === 'last'
        ? lastPly
        : action === 'previous'
          ? state.ply - 1
          : action === 'next'
            ? state.ply + 1
            : Math.round(action.goTo);
  const ply = Math.min(lastPly, Math.max(0, target));
  return { ...state, ply, stepped: action === 'next' && ply === state.ply + 1 };
}

/** A clock reading as m:ss, or h:mm:ss with hours (BRIEF-UI 6.2). Never rounded up. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds + 1e-9));
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const head = hours > 0 ? `${hours}:${pad(minutes)}` : String(minutes);
  return `${head}:${pad(whole % 60)}`;
}

/** Time a side had left at this point of the game; null when the source gave no clocks. */
export function clockAt(game: GameRecord, color: Color, ply: number): number | null {
  for (let index = Math.min(ply, game.moves.length) - 1; index >= 0; index -= 1) {
    const move = game.moves[index];
    if (move?.color === color) return move.clockSeconds;
  }
  const anyClock = game.moves.some((move) => move.clockSeconds !== null);
  return anyClock ? (game.timeControl?.initialSeconds ?? null) : null;
}

const MINUS = '−';

/**
 * An evaluation as the scoresheet writes it, from White's side: "+0.3", "−1.3",
 * "0.0" (never "−0.0"), "#3" when White mates in 3, "−#3" when Black does, and
 * the result once the game is over.
 */
export function formatScore(score: Score): string {
  if (score.kind === 'mate') return `${score.winner === 'white' ? '' : MINUS}#${score.moves}`;
  if (score.kind === 'over') {
    return score.winner === 'white' ? '1-0' : score.winner === 'black' ? '0-1' : '½-½';
  }
  const tenths = Math.round(score.value / 10);
  if (tenths === 0) return '0.0';
  return `${tenths > 0 ? '+' : MINUS}${(Math.abs(tenths) / 10).toFixed(1)}`;
}
