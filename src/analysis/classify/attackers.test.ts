import { Chess, type Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { getAttackers, getDefenders } from './attackers';

/** Sorted "square:piece" strings, so the order of discovery does not matter. */
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

describe('getAttackers', () => {
  it('lists a piece that can capture on the square', () => {
    const fen = legal('4k3/8/8/3n4/8/8/3R4/4K3 w - - 0 1');
    expect(names(getAttackers(fen, 'd5', 'white'))).toEqual(['d2:r']);
  });

  it('does not depend on whose turn it is', () => {
    const fen = legal('4k3/8/8/3n4/8/8/3R4/4K3 b - - 0 1');
    expect(names(getAttackers(fen, 'd5', 'white'))).toEqual(['d2:r']);
  });

  it('returns nothing when no piece can capture there', () => {
    const fen = legal('4k3/8/8/3n4/8/8/R7/4K3 b - - 0 1');
    expect(getAttackers(fen, 'd5', 'white')).toEqual([]);
  });

  it('returns nothing for an empty square or a piece of the attacking side', () => {
    const fen = legal('4k3/8/8/3n4/8/8/3R4/4K3 w - - 0 1');
    expect(getAttackers(fen, 'd4', 'white')).toEqual([]); // empty, though the rook covers it
    expect(getAttackers(fen, 'd2', 'white')).toEqual([]); // White's own rook, next to the king
  });

  it('counts the second rook of a battery behind the first', () => {
    const fen = legal('4k3/8/8/3n4/8/8/3R4/3RK3 w - - 0 1');
    expect(names(getAttackers(fen, 'd5', 'white'))).toEqual(['d1:r', 'd2:r']);
  });

  it('leaves out pieces behind the front attacker when x-rays are switched off', () => {
    const fen = legal('4k3/8/8/3n4/8/8/3R4/3RK3 w - - 0 1');
    expect(names(getAttackers(fen, 'd5', 'white', { xray: false }))).toEqual(['d2:r']);
  });

  it('counts a queen lined up behind a bishop on the diagonal', () => {
    const fen = legal('4k3/8/8/3n4/8/5B2/6Q1/4K3 w - - 0 1');
    expect(names(getAttackers(fen, 'd5', 'white'))).toEqual(['f3:b', 'g2:q']);
  });

  it('counts a bishop lined up behind a capturing pawn', () => {
    const fen = legal('4k3/8/8/3n4/4P3/5B2/8/4K3 w - - 0 1');
    expect(names(getAttackers(fen, 'd5', 'white'))).toEqual(['e4:p', 'f3:b']);
  });

  it('follows a battery three pieces deep', () => {
    const fen = legal('4k3/8/8/3n4/8/3R4/3Q4/3RK3 w - - 0 1');
    expect(names(getAttackers(fen, 'd5', 'white'))).toEqual(['d1:r', 'd2:q', 'd3:r']);
  });

  it('does not count a piece that is pinned to its king and cannot legally capture', () => {
    // The knight on c3 eyes d5 but is pinned on the c-file by the rook on c8.
    const fen = legal('2r1k3/8/8/3n4/8/2N5/8/2K5 w - - 0 1');
    expect(getAttackers(fen, 'd5', 'white')).toEqual([]);
  });

  it('counts the king when it can capture', () => {
    const fen = legal('4k3/8/8/3n4/4K3/8/8/8 w - - 0 1');
    expect(names(getAttackers(fen, 'd5', 'white'))).toEqual(['e4:k']);
  });

  it('counts the king next to the piece even when capturing would be illegal', () => {
    // The pawn on e6 guards d5, so Kxd5 is not a legal move; WintrChess still counts the king.
    const fen = legal('4k3/8/4p3/3n4/4K3/8/8/8 w - - 0 1');
    expect(names(getAttackers(fen, 'd5', 'white'))).toEqual(['e4:k']);
  });

  it('counts a pawn that can capture en passant as an attacker of the pawn it would remove', () => {
    const fen = legal('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    expect(names(getAttackers(fen, 'd5', 'white'))).toEqual(['e5:p']);
  });

  it('counts a pawn that captures with promotion once, not once per promotion piece', () => {
    const fen = legal('4k2r/6P1/8/8/8/8/8/4K3 w - - 0 1');
    expect(names(getAttackers(fen, 'h8', 'white'))).toEqual(['g7:p']);
  });
});

describe('getDefenders', () => {
  it('lists the piece that would recapture', () => {
    const fen = legal('4k3/8/4p3/3n4/8/8/3R4/4K3 w - - 0 1');
    expect(names(getDefenders(fen, 'd5'))).toEqual(['e6:p']);
  });

  it('finds defenders when nothing attacks the piece yet', () => {
    const fen = legal('4k3/8/4p3/3n4/8/8/8/4K3 w - - 0 1');
    expect(names(getDefenders(fen, 'd5'))).toEqual(['e6:p']);
  });

  it('returns nothing for a piece nobody guards', () => {
    const fen = legal('4k3/8/8/3n4/8/8/3R4/4K3 w - - 0 1');
    expect(getDefenders(fen, 'd5')).toEqual([]);
  });

  it('counts both rooks of a defending battery', () => {
    const fen = legal('3rk3/3r4/8/3n4/8/8/8/3RK3 w - - 0 1');
    expect(names(getDefenders(fen, 'd5'))).toEqual(['d7:r', 'd8:r']);
  });

  it('counts a defender that is free to recapture', () => {
    const fen = legal('4k3/8/4b3/3n4/8/8/8/3R2K1 w - - 0 1');
    expect(names(getDefenders(fen, 'd5'))).toEqual(['e6:b']);
  });

  it('does not count a defender that is pinned to its king', () => {
    // Same position with a rook on e1: the bishop on e6 may not leave the e-file.
    const fen = legal('4k3/8/4b3/3n4/8/8/8/3RR1K1 w - - 0 1');
    expect(getDefenders(fen, 'd5')).toEqual([]);
  });

  it('takes the capture that leaves the fewest recapturers', () => {
    // Qxd5 would unpin the bishop on e6 (one recapturer); Rxd5 keeps it pinned (none).
    const fen = legal('4k3/8/4b3/3n4/4Q3/8/8/3R2K1 w - - 0 1');
    expect(getDefenders(fen, 'd5')).toEqual([]);
  });

  it('returns nothing for an empty square', () => {
    const fen = legal('4k3/8/8/3n4/8/8/3R4/4K3 w - - 0 1');
    expect(getDefenders(fen, 'a4')).toEqual([]);
  });

  it('breaks a tie between captures in board order, a8 first, en passant included', () => {
    // A real position (Hikaru vs Sina-Movahed, chess.com/game/live/186299800014, after
    // 18...h5). The pawn on h5 can be taken en passant by the g5 pawn (then g7 or the
    // rook takes back) or by the queen on g4 (then the bishop or the rook takes back).
    // Both leave two recapturers; the capture from g5, earlier in board order, decides.
    const fen = legal('1k1r3r/1pqnbpp1/p1n1p1b1/2p3Pp/P1N1PPQN/2P4P/1P6/R1B1RBK1 w - h6 0 19');
    expect(names(getAttackers(fen, 'h5', 'white', { xray: false }))).toEqual(['g4:q', 'g5:p']);
    expect(names(getDefenders(fen, 'h5'))).toEqual(['g7:p', 'h8:r']);
  });
});
