import { Chess, type Move, type Square } from 'chess.js';

/** A line of play checked against the rules: `uci` and `san` always have the same length. */
export interface WalkedLine {
  uci: string[];
  san: string[];
}

export interface WalkOptions {
  /** The line is cut after this many half-moves. */
  maxPlies: number;
  /**
   * Accept castling written as "king takes own rook" (`e1h1`, `e8a8`), the
   * Chess960-compatible notation Lichess cloud eval uses, and rewrite it to
   * standard UCI (`e1g1`, `e8c8`). Off for a standard-chess engine, whose
   * output must not be reinterpreted.
   */
  kingToRookCastling: boolean;
}

const UCI_MOVE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

/** Plays `move` if chess.js accepts it; an illegal move leaves the position untouched. */
function tryMove(
  chess: Chess,
  move: { from: Square; to: Square; promotion?: string },
): Move | null {
  try {
    return chess.move(move);
  } catch {
    return null;
  }
}

/**
 * Plays the move a UCI token stands for and returns it, or returns null and
 * leaves the position as it was. (Playing directly is much cheaper than listing
 * the legal moves first: chess.js builds SAN and both FENs for every listed move.)
 */
function play(chess: Chess, token: string, kingToRookCastling: boolean): Move | null {
  const match = UCI_MOVE.exec(token);
  if (!match) return null;
  const from = match[1] as Square;
  const to = match[2] as Square;
  const promotion = match[3];

  const direct = tryMove(chess, { from, to, promotion });
  if (direct) {
    // chess.js ignores a promotion letter on a move that does not promote; such a token is not
    // a real move of this position, so it is refused.
    if (direct.lan === token) return direct;
    chess.undo();
    return null;
  }

  if (!kingToRookCastling || promotion !== undefined) return null;
  // A king can never legally move onto its own rook, so this spelling can only mean castling
  // towards that rook. It is accepted only if that castling move is legal right now.
  const king = chess.get(from);
  const rook = chess.get(to);
  if (king?.type !== 'k' || king.color !== chess.turn()) return null;
  if (rook?.type !== 'r' || rook.color !== king.color) return null;
  const kingside = to.charCodeAt(0) > from.charCodeAt(0);
  const castling = chess
    .moves({ square: from, verbose: true })
    .find((move) => (kingside ? move.isKingsideCastle() : move.isQueensideCastle()));
  return castling ? tryMove(chess, { from: castling.from, to: castling.to }) : null;
}

/**
 * Plays `moves` (UCI) from `fen` and returns the part that is legal, in
 * standard UCI and in SAN. The line is cut, never repaired, at the first token
 * that is not a legal move, and at `maxPlies`. Throws if `fen` is not a valid
 * position.
 */
export function walkLine(fen: string, moves: readonly string[], options: WalkOptions): WalkedLine {
  const chess = new Chess(fen);
  const uci: string[] = [];
  const san: string[] = [];
  for (const token of moves) {
    if (uci.length >= options.maxPlies) break;
    const move = play(chess, token, options.kingToRookCastling);
    if (!move) break;
    uci.push(move.lan);
    san.push(move.san);
  }
  return { uci, san };
}
