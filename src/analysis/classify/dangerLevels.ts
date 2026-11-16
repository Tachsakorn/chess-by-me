/**
 * Counter-threats: is a piece that can be taken really on offer?
 *
 * WintrChess calls this "danger levels" (GPL-3.0, WintrCat/wintrchess at commit
 * d145b2096895, shared/src/lib/reporter/utils/dangerLevels.ts). Taking a piece
 * is not free when the capture leaves the capturing side with something of
 * equal or greater value hanging, or walks into mate in one. The code is
 * written for this project on FEN strings; nothing is copied.
 * See docs/sources/classification.md.
 */
import {
  Chess,
  type Color as ChessColor,
  type Move,
  type PieceSymbol,
  type Square,
} from 'chess.js';
import type { Color } from '@/contract';
import { directCapturesOn, otherSide, type Capture, type PieceOnSquare } from './attackers';
import { getUnsafePieces, PIECE_VALUES, type PlayedCapture } from './pieceSafety';

/** A move that acts on a threatened piece: the opponent taking it, or the piece moving away. */
export interface ActingMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

function toColor(side: ChessColor): Color {
  return side === 'w' ? 'white' : 'black';
}

/**
 * The attacks on those unsafe pieces of `side` that are worth at least as
 * much as the threatened piece. The piece standing on the threatened piece's
 * own square is left out: after a capture that is the capturing piece itself.
 */
function attacksOnUnsafePieces(
  fen: string,
  threatened: PieceOnSquare,
  side: ChessColor,
  played?: PlayedCapture,
): Capture[] {
  return getUnsafePieces(fen, toColor(side), played)
    .filter(
      (unsafe) =>
        unsafe.square !== threatened.square &&
        PIECE_VALUES[unsafe.piece] >= PIECE_VALUES[threatened.piece],
    )
    .flatMap((unsafe) => directCapturesOn(fen, unsafe.square, otherSide(side)));
}

/** A piece below a queen is "pinned to a mate" when the side to move can now mate in one. */
function allowsMateInOne(board: Chess, threatened: PieceOnSquare): boolean {
  return (
    PIECE_VALUES[threatened.piece] < PIECE_VALUES.q &&
    board.moves().some((san) => san.includes('#'))
  );
}

function tryMove(board: Chess, acting: ActingMove): Move | null {
  try {
    return board.move({ from: acting.from, to: acting.to, promotion: acting.promotion });
  } catch {
    return null;
  }
}

/**
 * After `acting` is played, is the side that played it left with a piece worth
 * at least as much as the threatened piece hanging, or facing mate in one?
 * False when the move is not legal in the position.
 */
export function moveLeavesGreaterThreat(
  fen: string,
  threatened: PieceOnSquare,
  acting: ActingMove,
): boolean {
  const board = new Chess(fen);
  const actingSide = board.turn();
  if (!tryMove(board, acting)) return false;
  if (attacksOnUnsafePieces(board.fen(), threatened, actingSide).length > 0) return true;
  return allowsMateInOne(board, threatened);
}

/**
 * Like `moveLeavesGreaterThreat`, but only attacks that did not exist before
 * the move count: the move itself must have caused them.
 */
export function moveCreatesGreaterThreat(
  fen: string,
  threatened: PieceOnSquare,
  acting: ActingMove,
): boolean {
  const board = new Chess(fen);
  const actingSide = board.turn();
  const attacksBefore = attacksOnUnsafePieces(fen, threatened, actingSide);
  const played = tryMove(board, acting);
  if (!played) return false;

  const attacksAfter = attacksOnUnsafePieces(board.fen(), threatened, actingSide, {
    captured: played.captured,
  });
  const isNew = (attack: Capture) =>
    !attacksBefore.some(
      (known) =>
        known.from === attack.from &&
        known.to === attack.to &&
        known.piece === attack.piece &&
        known.promotion === attack.promotion,
    );
  if (attacksAfter.some(isNew)) return true;
  return allowsMateInOne(board, threatened);
}

/**
 * Whether every way of taking the piece standing on `piece.square` leaves the
 * capturing side with a greater problem. A piece nobody can take counts as
 * covered.
 */
export function isCoveredByCounterThreats(fen: string, piece: PieceOnSquare): boolean {
  const owner = new Chess(fen).get(piece.square)?.color;
  if (!owner) return true;
  return directCapturesOn(fen, piece.square, otherSide(owner)).every((capture) =>
    moveLeavesGreaterThreat(fen, piece, capture),
  );
}
