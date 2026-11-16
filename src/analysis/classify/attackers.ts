/**
 * Which pieces attack a square, and which pieces defend the piece standing on it.
 *
 * The method follows WintrChess (GPL-3.0, WintrCat/wintrchess at commit
 * d145b2096895, shared/src/lib/reporter/utils/attackers.ts and defenders.ts):
 * an attacker is a piece with a LEGAL capture on the square (so a pinned piece
 * does not count), plus the enemy king when it stands next to the square, plus
 * the pieces lined up behind an attacker (batteries). The code is written for
 * this project on FEN strings; nothing is copied. The places where it behaves
 * differently from WintrChess are listed in docs/sources/classification.md.
 */
import {
  Chess,
  type Color as ChessColor,
  type Move,
  type PieceSymbol,
  type Square,
} from 'chess.js';
import type { Color } from '@/contract';

export interface PieceOnSquare {
  square: Square;
  piece: PieceSymbol;
}

/** A capture one side could make: the capturing piece, where it stands, where it lands. */
export interface Capture {
  from: Square;
  to: Square;
  piece: PieceSymbol;
  promotion?: PieceSymbol;
}

export function toChessColor(color: Color): ChessColor {
  return color === 'white' ? 'w' : 'b';
}

export function otherSide(color: ChessColor): ChessColor {
  return color === 'w' ? 'b' : 'w';
}

/**
 * The same position with `side` to move. An en passant square belongs to the
 * side that was to move, so it is dropped when the turn changes hands.
 */
export function withTurn(fen: string, side: ChessColor): string {
  const fields = fen.split(' ');
  if (fields[1] !== side) {
    fields[1] = side;
    fields[3] = '-';
  }
  return fields.join(' ');
}

/** The square a capture empties: where the move lands, except for en passant. */
export function captureSquare(move: Move): Square {
  return move.isEnPassant() ? ((move.to.charAt(0) + move.from.charAt(1)) as Square) : move.to;
}

/**
 * The pieces of `by` that attack the piece standing on `square`, each given
 * once. With `xray` (the default) the pieces lined up behind an attacker are
 * included. The square must hold a piece of the other colour: for an empty
 * square or one of `by`'s own pieces the answer is empty. Whose turn it is in
 * `fen` does not matter.
 */
export function getAttackers(
  fen: string,
  square: Square,
  by: Color,
  options: { xray?: boolean } = {},
): PieceOnSquare[] {
  return capturesOn(fen, square, toChessColor(by), options.xray ?? true).map(toPieceOnSquare);
}

/**
 * The pieces that defend the piece standing on `square`: the ones that could
 * legally take back after it is captured. When several enemy pieces can
 * capture, the capture that leaves the fewest recapturers decides. When no
 * enemy piece can capture, an enemy piece of the same kind is imagined on the
 * square and its attackers are counted.
 */
export function getDefenders(
  fen: string,
  square: Square,
  options: { xray?: boolean } = {},
): PieceOnSquare[] {
  const xray = options.xray ?? true;
  const board = new Chess(fen);
  const piece = board.get(square);
  if (!piece) return [];
  const owner = piece.color;
  const enemy = otherSide(owner);

  let fewest: readonly Capture[] | undefined;
  for (const capture of directCapturesOn(fen, square, enemy)) {
    const afterCapture = new Chess(withTurn(fen, enemy));
    try {
      afterCapture.move({ from: capture.from, to: capture.to, promotion: capture.promotion });
    } catch {
      continue; // the king "attacks" a guarded piece but may not take it
    }
    const recaptures = capturesOn(afterCapture.fen(), capture.to, owner, xray);
    if (!fewest || recaptures.length < fewest.length) fewest = recaptures;
  }

  if (!fewest) {
    board.put({ type: piece.type, color: enemy }, square);
    fewest = capturesOn(board.fen(), square, owner, xray);
  }
  return fewest.map(toPieceOnSquare);
}

/** The captures `side` has on the piece standing on `target`, batteries included when `xray`. */
export function capturesOn(
  fen: string,
  target: Square,
  side: ChessColor,
  xray: boolean,
): readonly Capture[] {
  const direct = directCapturesOn(fen, target, side);
  if (!xray) return direct;

  const all = [...direct];
  const queue = direct.map((front) => ({ fen, front, seen: direct }));
  for (let entry = queue.pop(); entry; entry = queue.pop()) {
    const { front, seen } = entry;
    if (front.piece === 'k') continue; // nothing attacks through a king

    // Lift the front piece off the board and see who attacks the square now.
    const board = new Chess(entry.fen);
    board.remove(front.from);
    const without = board.fen();
    const now = directCapturesOn(without, target, side);
    const revealed = now.filter((capture) => !seen.some((known) => known.from === capture.from));

    all.push(...revealed);
    queue.push(...revealed.map((next) => ({ fen: without, front: next, seen: now })));
  }
  return all;
}

/**
 * The captures `side` has on the piece standing on `target`, one per capturing
 * piece. The result is shared between callers: do not change it.
 */
export function directCapturesOn(
  fen: string,
  target: Square,
  side: ChessColor,
): readonly Capture[] {
  const key = `${side}${target}${fen}`;
  const known = directCaptureCache.get(key);
  if (known) return known;
  const captures = findDirectCaptures(fen, target, side);
  if (directCaptureCache.size >= CACHE_LIMIT) directCaptureCache.clear();
  directCaptureCache.set(key, captures);
  return captures;
}

// The safety rules ask the same question about the same position many times
// over (a piece's attackers, then its defenders, then again for every escape
// square), so answers are remembered. The answer depends only on the key.
const CACHE_LIMIT = 20000;
const directCaptureCache = new Map<string, readonly Capture[]>();

function findDirectCaptures(fen: string, target: Square, side: ChessColor): Capture[] {
  const sided = withTurn(fen, side);
  const board = new Chess(sided);
  const occupant = board.get(target);
  if (!occupant || occupant.color === side) return [];

  const captures: Capture[] = [];
  let kingNextDoor: Square | undefined;
  // Every piece that eyes the square is tried: only a legal capture counts.
  for (const from of board.attackers(target, side)) {
    const piece = board.get(from);
    if (!piece) continue;
    const lastRank = target.charAt(1) === (side === 'w' ? '8' : '1');
    // A pawn capturing onto the last rank is one attacker, not one per promotion piece.
    const promotion = piece.type === 'p' && lastRank ? 'q' : undefined;
    if (isLegal(board, from, target, promotion)) {
      captures.push({ from, to: target, piece: piece.type, ...(promotion ? { promotion } : {}) });
    } else if (piece.type === 'k') {
      kingNextDoor = from;
    }
  }

  // En passant: the pawn that just made a double step can be taken by a pawn
  // that lands on the square behind it.
  const enPassant = sided.split(' ')[3];
  if (
    occupant.type === 'p' &&
    enPassant !== undefined &&
    enPassant !== '-' &&
    enPassant.charAt(0) === target.charAt(0) &&
    target.charAt(1) === (side === 'w' ? '5' : '4')
  ) {
    const landing = enPassant as Square;
    for (const from of board.attackers(landing, side)) {
      if (board.get(from)?.type === 'p' && isLegal(board, from, landing, undefined)) {
        captures.push({ from, to: landing, piece: 'p' });
      }
    }
  }

  // Board order (a8 first, h1 last), the order chess.js generates moves in:
  // when two captures tie, the earlier one decides (see getDefenders).
  captures.sort((a, b) => boardIndex(a.from) - boardIndex(b.from));

  // The king counts as an attacker of an enemy piece next to it even when the
  // piece is guarded and the capture would be illegal. It comes last.
  if (kingNextDoor) captures.push({ from: kingNextDoor, to: target, piece: 'k' });
  return captures;
}

/** 0 for a8, 7 for h8, ... 63 for h1. */
function boardIndex(square: Square): number {
  return (8 - Number(square.charAt(1))) * 8 + (square.charCodeAt(0) - 97);
}

/** Whether the side to move may play this move; the board is left as it was. */
function isLegal(
  board: Chess,
  from: Square,
  to: Square,
  promotion: PieceSymbol | undefined,
): boolean {
  try {
    board.move({ from, to, promotion });
  } catch {
    return false;
  }
  board.undo();
  return true;
}

function toPieceOnSquare(capture: Capture): PieceOnSquare {
  return { square: capture.from, piece: capture.piece };
}
