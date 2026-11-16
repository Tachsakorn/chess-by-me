/**
 * Which sound a step on the review board makes (owner, 2026-11-16). Pure: the screen asks after
 * every action and plays what this returns.
 *
 * Sound: one step forward or back (the step buttons, the arrow keys), a move made on the board,
 * and the engine's reply to it. Silent: a jump to the start or the end, the steps that repeat
 * while a step button is held down, a tap on the graph or in the move list, flipping the board,
 * and leaving a line.
 */
import { Chess } from 'chess.js';
import type { GameMove, GameRecord } from '@/contract';
import type { ReviewAction, ReviewPosition } from '@/ui/review/tryLine';
import type { SoundKind } from './synth';

/**
 * The sound of one move. Promotion, mate and the end of the game share the end sound (owner);
 * then check, then capture; everything else, castling included, is a move.
 */
export function moveSoundKind(move: GameMove, endsGame: boolean): SoundKind {
  if (endsGame || move.uci.length === 5 || move.san.includes('#')) return 'end';
  if (move.san.includes('+')) return 'check';
  if (move.san.includes('x')) return 'capture';
  return 'move';
}

/** The move that led to the position on the board, or null at the game's start. */
function moveOnBoard(game: GameRecord, state: ReviewPosition): GameMove | null {
  if (state.line) return state.line.moves[state.line.at - 1] ?? null;
  return game.moves[state.ply - 1] ?? null;
}

function samePlace(a: ReviewPosition, b: ReviewPosition): boolean {
  return (
    a.ply === b.ply &&
    (a.line === null) === (b.line === null) &&
    a.line?.at === b.line?.at &&
    a.line?.moves === b.line?.moves
  );
}

/** True when nothing more can be played: mate, stalemate, or a draw by the rules. */
function over(fen: string): boolean {
  try {
    return new Chess(fen).isGameOver();
  } catch {
    return false;
  }
}

/**
 * The sound for going from `before` to `after` by `action`, or null for none. `repeat`: the
 * action repeats by itself (a held step button, a held arrow key).
 */
export function soundFor(
  game: GameRecord,
  before: ReviewPosition,
  after: ReviewPosition,
  action: ReviewAction,
  repeat: boolean,
): SoundKind | null {
  if (repeat || samePlace(before, after)) return null;
  const forward = action === 'next' || (typeof action === 'object' && 'play' in action);
  if (!forward && action !== 'previous') return null;
  if (!forward) {
    // One step back: the move taken back.
    const taken = moveOnBoard(game, before);
    return taken ? moveSoundKind(taken, false) : null;
  }
  const played = moveOnBoard(game, after);
  if (!played) return null;
  const endsGame = after.line ? over(played.fenAfter) : after.ply === game.moves.length;
  return moveSoundKind(played, endsGame);
}
