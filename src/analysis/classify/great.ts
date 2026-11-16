/**
 * Great moves: the only move that keeps the mover's position (WintrChess calls
 * this class "critical").
 *
 * The conditions follow WintrChess (GPL-3.0, WintrCat/wintrchess at commit
 * d145b2096895, shared/src/lib/reporter/classification/critical.ts and
 * utils/criticalMove.ts). The code is written for this project's types;
 * nothing is copied. See docs/sources/classification.md.
 */
import { Chess, type Move } from 'chess.js';
import type { GameMove, PositionEval } from '@/contract';
import { captureSquare } from './attackers';
import { scoreFor } from './categories';
import { expectedPointsFor, pointLoss } from './expectedPoints';
import { isPieceSafe } from './pieceSafety';

/** One move with the engine's verdict on the position before and after it. */
export interface MoveContext {
  move: Pick<GameMove, 'uci' | 'color' | 'fenBefore' | 'fenAfter'>;
  /** `lines[0]` is the engine's first choice, `lines[1]` its second, when it gave one. */
  before: PositionEval;
  after: PositionEval;
  /**
   * The position right after the mover's own previous move, when there was one. Brilliant uses
   * it to tell a new sacrifice from a piece already left hanging (owner, 2026-11-15).
   */
  afterOwnPrevious?: string;
}

/** A second-best move that still leaves the mover this far ahead makes the best move easy. */
export const COMPLETELY_WINNING_CP = 700;

/** The second-best move must give up at least this much for the best move to be Great. */
export const GREAT_MIN_SECOND_LOSS = 0.1;

/** The played move as chess.js describes it (captured piece, promotion, squares). */
export function playedMove(context: MoveContext): Move {
  const { uci, fenBefore } = context.move;
  return new Chess(fenBefore).move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.charAt(4) || undefined,
  });
}

/**
 * The first test for both Great and Brilliant: the move must matter. It does
 * not when the mover wins easily anyway, is still worse afterwards, promotes
 * to a queen, or was only answering a check.
 *
 * "Still worse" is any score below 0 for the mover, unless `minExpected` is given: then only
 * expected points below it count (Brilliant passes 0.455, owner 2026-11-15). A forced mate
 * against the mover always counts.
 */
export function isCriticalCandidate(context: MoveContext, minExpected?: number): boolean {
  const { move, before, after } = context;
  const afterForMover = scoreFor(after.score, move.color);

  const second = before.lines[1];
  if (second) {
    const secondForMover = scoreFor(second.score, move.color);
    if (secondForMover.kind === 'cp' && secondForMover.value >= COMPLETELY_WINNING_CP) return false;
  } else if (afterForMover.kind === 'cp' && afterForMover.value >= COMPLETELY_WINNING_CP) {
    return false;
  }

  const mateAgainst =
    afterForMover.kind !== 'cp' && !afterForMover.winning && afterForMover.moves > 0;
  const stillWorse =
    afterForMover.kind === 'cp'
      ? minExpected === undefined
        ? afterForMover.value < 0
        : expectedPointsFor(after.score, move.color) < minExpected
      : mateAgainst;
  if (stillWorse) return false;

  if (move.uci.charAt(4) === 'q') return false;
  if (new Chess(move.fenBefore).isCheck()) return false;
  return true;
}

/**
 * Whether the engine's first choice, having been played, deserves Great: it
 * passes `isCriticalCandidate`, does not merely find a forced mate or pick up
 * a hanging piece, and the second-best move was clearly worse. Without a
 * second engine line the answer is always no.
 */
export function isGreat(context: MoveContext): boolean {
  if (!isCriticalCandidate(context)) return false;
  const { move, before, after } = context;

  const afterForMover = scoreFor(after.score, move.color);
  if (afterForMover.kind === 'mate' && afterForMover.winning && afterForMover.moves > 0) {
    return false;
  }

  const played = playedMove(context);
  if (played.captured !== undefined && !isPieceSafe(move.fenBefore, captureSquare(played))) {
    return false;
  }

  const second = before.lines[1];
  if (!second) return false;
  return pointLoss(before.score, second.score, move.color) >= GREAT_MIN_SECOND_LOSS;
}
