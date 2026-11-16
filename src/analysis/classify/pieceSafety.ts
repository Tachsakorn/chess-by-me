/**
 * Piece safety: can a piece be won where it stands?
 *
 * The rules and the piece values follow WintrChess (GPL-3.0, WintrCat/wintrchess
 * at commit d145b2096895, shared/src/lib/reporter/utils/pieceSafety.ts and
 * shared/src/constants/utils.ts). The code is written for this project on FEN
 * strings; nothing is copied. See docs/sources/classification.md.
 */
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { Color } from '@/contract';
import { getAttackers, getDefenders, toChessColor, type PieceOnSquare } from './attackers';

/** Material values used to compare attackers, defenders and captures. */
export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: Infinity,
};

/** What the move that led to this position captured, if anything. */
export interface PlayedCapture {
  captured?: PieceSymbol;
}

/**
 * Whether the piece standing on `square` is safe from being won. `playedMove`
 * is the move that produced the position; it matters for one case, a rook
 * that can only be exchanged for a second minor piece.
 */
export function isPieceSafe(fen: string, square: Square, playedMove?: PlayedCapture): boolean {
  // The same piece is asked about again and again while escape squares and
  // counter-threats are tried; the answer depends only on these three inputs.
  const key = `${square}${playedMove?.captured ?? '-'}${fen}`;
  const known = safetyCache.get(key);
  if (known !== undefined) return known;
  const safe = decideSafety(fen, square, playedMove);
  if (safetyCache.size >= SAFETY_CACHE_LIMIT) safetyCache.clear();
  safetyCache.set(key, safe);
  return safe;
}

const SAFETY_CACHE_LIMIT = 20000;
const safetyCache = new Map<string, boolean>();

function decideSafety(fen: string, square: Square, playedMove?: PlayedCapture): boolean {
  const piece = new Chess(fen).get(square);
  if (!piece) return true;
  const enemy: Color = piece.color === 'w' ? 'black' : 'white';
  const value = PIECE_VALUES[piece.type];

  const directAttackers = getAttackers(fen, square, enemy, { xray: false });
  // Nothing attacks it (a piece behind an attacker needs an attacker in front).
  if (directAttackers.length === 0) return true;
  const attackers = getAttackers(fen, square, enemy);
  const defenders = getDefenders(fen, square);

  // A rook that just took a minor piece and can only be taken by one minor
  // piece, with a recapture ready, gives up a rook for two pieces: safe.
  const onlyAttacker = attackers.length === 1 ? attackers[0] : undefined;
  if (
    playedMove?.captured !== undefined &&
    piece.type === 'r' &&
    PIECE_VALUES[playedMove.captured] === PIECE_VALUES.n &&
    onlyAttacker !== undefined &&
    PIECE_VALUES[onlyAttacker.piece] === PIECE_VALUES.n &&
    defenders.length > 0
  ) {
    return true;
  }

  // Attacked by something cheaper than itself: not safe, however well guarded.
  if (directAttackers.some((attacker) => PIECE_VALUES[attacker.piece] < value)) return false;

  // Guarded at least as many times as it is attacked: safe.
  if (attackers.length <= defenders.length) return true;

  const cheapestAttacker = Math.min(
    ...directAttackers.map((attacker) => PIECE_VALUES[attacker.piece]),
  );

  // Outnumbered, but cheaper than every attacker and guarded by something
  // that is also cheaper than every attacker: taking it loses material.
  if (
    value < cheapestAttacker &&
    defenders.some((defender) => PIECE_VALUES[defender.piece] < cheapestAttacker)
  ) {
    return true;
  }

  // Outnumbered but guarded by a pawn: safe.
  return defenders.some((defender) => defender.piece === 'p');
}

/**
 * The pieces of `color` that can be won: knights, bishops, rooks and queens
 * that are not safe. Pawns and kings are never listed. After a capture,
 * pieces worth no more than what was just captured are left out, because
 * losing one of them is at worst an even trade.
 */
export function getUnsafePieces(
  fen: string,
  color: Color,
  playedMove?: PlayedCapture,
): PieceOnSquare[] {
  const side = toChessColor(color);
  const capturedValue = playedMove?.captured ? PIECE_VALUES[playedMove.captured] : 0;
  const unsafe: PieceOnSquare[] = [];
  for (const row of new Chess(fen).board()) {
    for (const cell of row) {
      if (!cell || cell.color !== side || cell.type === 'p' || cell.type === 'k') continue;
      if (PIECE_VALUES[cell.type] <= capturedValue) continue;
      if (!isPieceSafe(fen, cell.square, playedMove)) {
        unsafe.push({ square: cell.square, piece: cell.type });
      }
    }
  }
  return unsafe;
}
