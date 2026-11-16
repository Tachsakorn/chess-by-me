/**
 * Trapped pieces: attacked where it stands, and lost wherever it goes.
 *
 * The definition follows WintrChess (GPL-3.0, WintrCat/wintrchess at commit
 * d145b2096895, shared/src/lib/reporter/utils/pieceTrapped.ts). The code is
 * written for this project on FEN strings; nothing is copied.
 * See docs/sources/classification.md.
 */
import { Chess, type Square } from 'chess.js';
import { withTurn } from './attackers';
import { moveCreatesGreaterThreat } from './dangerLevels';
import { isPieceSafe } from './pieceSafety';

/**
 * Whether the piece standing on `square` is trapped: it is not safe where it
 * stands, and each of its moves either leaves it unsafe on the new square or
 * exposes something at least as valuable. Whose turn it is in `fen` does not
 * matter: the piece's own side is given the move.
 */
export function isPieceTrapped(fen: string, square: Square): boolean {
  const piece = new Chess(fen).get(square);
  if (!piece) return false;
  const ownTurn = withTurn(fen, piece.color);
  if (isPieceSafe(ownTurn, square)) return false;

  const threatened = { square, piece: piece.type };
  return new Chess(ownTurn).moves({ square, verbose: true }).every((move) => {
    if (move.captured === 'k') return false; // "taking" the king is not a way to be lost
    if (moveCreatesGreaterThreat(ownTurn, threatened, move)) return true;
    const board = new Chess(ownTurn);
    const played = board.move({ from: move.from, to: move.to, promotion: move.promotion });
    return !isPieceSafe(board.fen(), played.to, { captured: played.captured });
  });
}
