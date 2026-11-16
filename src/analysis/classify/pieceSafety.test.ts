import { Chess, type Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { getUnsafePieces, isPieceSafe } from './pieceSafety';

function names(pieces: ReadonlyArray<{ square: Square; piece: string }>): string[] {
  return pieces.map((entry) => `${entry.square}:${entry.piece}`).sort();
}

/** Every hand-built position must be one a real game could reach. */
function legal(fen: string): string {
  const board = new Chess(fen);
  const sideToMove = board.turn();
  const waiting = sideToMove === 'w' ? 'b' : 'w';
  const waitingKing = board.findPiece({ type: 'k', color: waiting })[0];
  if (!waitingKing) throw new Error(`no king in ${fen}`);
  if (board.isAttacked(waitingKing, sideToMove)) {
    throw new Error(`side not to move is in check in ${fen}`);
  }
  return fen;
}

describe('getUnsafePieces', () => {
  it('lists an undefended piece that is attacked once', () => {
    const fen = legal('4k3/8/8/3n4/8/8/3R4/4K3 w - - 0 1');
    expect(names(getUnsafePieces(fen, 'black'))).toEqual(['d5:n']);
    expect(isPieceSafe(fen, 'd5')).toBe(false);
  });

  it('gives the same answer whoever is to move', () => {
    const fen = legal('4k3/8/8/3n4/8/8/3R4/4K3 b - - 0 1');
    expect(names(getUnsafePieces(fen, 'black'))).toEqual(['d5:n']);
  });

  it('treats a piece nobody attacks as safe', () => {
    const fen = legal('4k3/8/8/3n4/8/8/R7/4K3 b - - 0 1');
    expect(getUnsafePieces(fen, 'black')).toEqual([]);
    expect(getUnsafePieces(fen, 'white')).toEqual([]);
  });

  it('treats a piece defended as often as it is attacked by a more valuable piece as safe', () => {
    // Knight attacked by a rook, guarded by a pawn.
    const fen = legal('4k3/8/4p3/3n4/8/8/3R4/4K3 w - - 0 1');
    expect(getUnsafePieces(fen, 'black')).toEqual([]);
    expect(isPieceSafe(fen, 'd5')).toBe(true);
  });

  it('treats a piece defended as often as it is attacked by an equal piece as safe', () => {
    // Knight attacked by a bishop, guarded by a rook.
    const fen = legal('3rk3/8/8/3n4/8/5B2/8/4K3 w - - 0 1');
    expect(getUnsafePieces(fen, 'black')).toEqual([]);
  });

  it('lists a piece attacked by a less valuable piece even when it is defended', () => {
    // Rook attacked by a knight, guarded by a pawn.
    const fen = legal('4k3/8/4p3/3r4/8/2N5/8/4K3 w - - 0 1');
    expect(names(getUnsafePieces(fen, 'black'))).toEqual(['d5:r']);
  });

  it('lists a queen attacked by a rook even when it is defended twice', () => {
    const fen = legal('3rk3/8/4p3/3q4/8/8/3R4/4K3 w - - 0 1');
    expect(names(getUnsafePieces(fen, 'black'))).toEqual(['d5:q']);
  });

  it('does not count a pinned defender: the piece it guards is unsafe', () => {
    // The bishop on e6 (itself guarded by the pawn on f7) is pinned by the rook on e1 and
    // cannot recapture on d5.
    const pinned = legal('4k3/5p2/4b3/3n4/8/8/8/3RR1K1 w - - 0 1');
    expect(names(getUnsafePieces(pinned, 'black'))).toEqual(['d5:n']);
    // Without the pin the same knight is safe.
    const free = legal('4k3/5p2/4b3/3n4/8/8/8/3R2K1 w - - 0 1');
    expect(getUnsafePieces(free, 'black')).toEqual([]);
  });

  it('counts a battery as two attackers: one defender is not enough', () => {
    const fen = legal('3rk3/8/8/3n4/8/8/3R4/3RK3 w - - 0 1');
    expect(names(getUnsafePieces(fen, 'black'))).toEqual(['d5:n']);
  });

  it('counts a battery of defenders too: two against two is safe', () => {
    const fen = legal('3rk3/3r4/8/3n4/8/8/3R4/3RK3 w - - 0 1');
    expect(getUnsafePieces(fen, 'black')).toEqual([]);
  });

  it('treats an outnumbered piece as safe when a pawn guards it', () => {
    // Knight attacked by rook and bishop, guarded only by a pawn.
    const fen = legal('4k3/8/4p3/3n4/8/5B2/3R4/4K3 w - - 0 1');
    expect(getUnsafePieces(fen, 'black')).toEqual([]);
  });

  it('lists an outnumbered piece that no pawn guards', () => {
    // Knight attacked by rook and bishop, guarded only by a rook.
    const fen = legal('3rk3/8/8/3n4/8/5B2/3R4/4K3 w - - 0 1');
    expect(names(getUnsafePieces(fen, 'black'))).toEqual(['d5:n']);
  });

  it('treats an outnumbered piece as safe when a guard is cheaper than every attacker', () => {
    // Bishop attacked by two rooks, guarded by a knight: taking it costs a rook for a bishop.
    const fen = legal('4k3/8/1n6/3b4/8/8/3R4/3RK3 w - - 0 1');
    expect(getUnsafePieces(fen, 'black')).toEqual([]);
  });

  it('never lists kings or pawns', () => {
    // Black's king is in check and the pawn on d5 hangs to the rook on d2.
    const fen = legal('4k3/8/8/3p4/8/8/3RR3/4K3 b - - 0 1');
    expect(getUnsafePieces(fen, 'black')).toEqual([]);
  });

  it('lists every unsafe piece of the colour asked for, and only that colour', () => {
    // Black's knight and bishop both hang to rooks; White's rooks are attacked by nothing.
    const fen = legal('4k3/8/8/3n3b/8/8/3R4/4K2R w - - 0 1');
    expect(names(getUnsafePieces(fen, 'black'))).toEqual(['d5:n', 'h5:b']);
    expect(getUnsafePieces(fen, 'white')).toEqual([]);
  });
});

describe('getUnsafePieces after a capture', () => {
  // Rook attacked by a bishop, guarded by a pawn.
  const rookForMinor = '4k3/8/4p3/3r4/8/5B2/8/4K3 w - - 0 1';

  it('lists a rook attacked by a minor piece', () => {
    expect(names(getUnsafePieces(legal(rookForMinor), 'black'))).toEqual(['d5:r']);
  });

  it('treats that rook as safe when the move just played won a minor piece', () => {
    // The rook can only be exchanged for a second minor piece: two pieces for a rook.
    expect(getUnsafePieces(rookForMinor, 'black', { captured: 'n' })).toEqual([]);
    expect(isPieceSafe(rookForMinor, 'd5', { captured: 'b' })).toBe(true);
  });

  it('still lists that rook when the move just played won only a pawn', () => {
    expect(names(getUnsafePieces(rookForMinor, 'black', { captured: 'p' }))).toEqual(['d5:r']);
  });

  it('leaves out pieces worth no more than what the move just captured', () => {
    // Queen attacked by a bishop, guarded by a pawn.
    const fen = legal('4k3/8/4p3/3q4/8/5B2/8/4K3 w - - 0 1');
    expect(names(getUnsafePieces(fen, 'black', { captured: 'r' }))).toEqual(['d5:q']);
    expect(getUnsafePieces(fen, 'black', { captured: 'q' })).toEqual([]);
  });
});
