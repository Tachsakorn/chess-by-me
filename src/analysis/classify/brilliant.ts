/**
 * Brilliant moves: a best move that leaves a piece to be taken.
 *
 * The conditions follow WintrChess (GPL-3.0, WintrCat/wintrchess at commit
 * d145b2096895, shared/src/lib/reporter/classification/brilliant.ts). The code
 * is written for this project's types; nothing is copied.
 * See docs/sources/classification.md.
 */
import { Chess, type Square } from 'chess.js';
import type { Color } from '@/contract';
import { getAttackers, type PieceOnSquare } from './attackers';
import { isCoveredByCounterThreats } from './dangerLevels';
import { AT_LEAST_EQUAL_EXPECTED } from './expectedPoints';
import { isCriticalCandidate, playedMove, type MoveContext } from './great';
import { getUnsafePieces } from './pieceSafety';
import { isPieceTrapped } from './pieceTrapped';

/**
 * Whether a move already judged Best (or Great) deserves Brilliant. In order:
 * it must pass `isCriticalCandidate` and not be a promotion; after it the
 * mover must have a piece that can be won (a piece worth no more than what the
 * move captured does not count, so even trades and recaptures are out); the
 * move must not simply have reduced the number of such pieces; taking the
 * piece must not be punished at once (see dangerLevels.ts); and the piece must
 * not have been lost anyway (trapped).
 */
export function isBrilliant(context: MoveContext): boolean {
  // A sacrifice may leave the mover a little worse, down to "at least equal" (owner,
  // 2026-11-15; the original rule asks for 0 or better). Great keeps the original.
  if (!isCriticalCandidate(context, AT_LEAST_EQUAL_EXPECTED)) return false;
  const { move } = context;
  const played = playedMove(context);
  if (played.promotion !== undefined) return false;

  const unsafeBefore = getUnsafePieces(move.fenBefore, move.color);
  const unsafeAfter = getUnsafePieces(move.fenAfter, move.color, { captured: played.captured });

  // Moving a piece out of danger is not a sacrifice (a checking move is let through).
  const givesCheck = new Chess(move.fenAfter).isCheck();
  if (!givesCheck && unsafeAfter.length < unsafeBefore.length) return false;

  // Every piece left hanging is covered by a counter-threat, or nothing hangs at all.
  if (unsafeAfter.every((piece) => isCoveredByCounterThreats(move.fenAfter, piece))) return false;

  const trappedBefore = unsafeBefore.filter((piece) =>
    isPieceTrapped(move.fenBefore, piece.square),
  );
  const trappedAfter = unsafeAfter.filter((piece) => isPieceTrapped(move.fenAfter, piece.square));
  const movedPieceWasTrapped = trappedBefore.some((piece) => piece.square === played.from);
  if (
    trappedAfter.length === unsafeAfter.length ||
    movedPieceWasTrapped ||
    trappedAfter.length < trappedBefore.length
  ) {
    return false;
  }

  // A sacrifice counts once (owner, 2026-11-15): at least one piece must be newly left.
  return unsafeAfter.some((piece) => !leftAlready(context, piece));
}

/**
 * Whether `piece` was already left to be taken after the mover's own previous move, on the same
 * square, and is still attacked by at least one of the same enemy pieces: then leaving it again
 * is not a new sacrifice (10.O-O-O after 9.Qd2 left the g5 bishop to ...hxg5).
 */
function leftAlready(context: MoveContext, piece: PieceOnSquare): boolean {
  const earlier = context.afterOwnPrevious;
  if (!earlier) return false;
  const mover = context.move.color;
  const wasLeft = getUnsafePieces(earlier, mover).some(
    (old) => old.square === piece.square && old.piece === piece.piece,
  );
  if (!wasLeft) return false;
  const enemy: Color = mover === 'white' ? 'black' : 'white';
  const key = (p: PieceOnSquare) => `${p.piece}@${p.square}`;
  const attackersThen = new Set(getAttackers(earlier, piece.square as Square, enemy).map(key));
  return getAttackers(context.move.fenAfter, piece.square, enemy).some((p) =>
    attackersThen.has(key(p)),
  );
}
