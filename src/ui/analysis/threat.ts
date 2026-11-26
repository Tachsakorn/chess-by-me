/**
 * The threat of a position (the analysis board, 2026-11-26): what the other side would play if
 * the side to move passed. The position is the same with the other side to move (a "null move");
 * the engine's best move there is the threat.
 */
import { Chess } from 'chess.js';

/**
 * The position with the other side to move, or null when there is none: the side to move is in
 * check (passing would leave its king to be taken), or the game is over. The en passant square
 * goes (it belonged to the move just played) and the move number moves on after Black.
 */
export function passedPosition(fen: string): string | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }
  if (chess.inCheck() || chess.isGameOver()) return null;
  const [placement, side, castling, , halfmoves = '0', fullmoves = '1'] = fen.split(' ');
  const next = side === 'w' ? 'b' : 'w';
  const number = side === 'b' ? Number(fullmoves) + 1 : Number(fullmoves);
  const passed = `${placement} ${next} ${castling} - ${halfmoves} ${number}`;
  try {
    // chess.js turns down a position where the side not to move is in check.
    new Chess(passed);
  } catch {
    return null;
  }
  return passed;
}
