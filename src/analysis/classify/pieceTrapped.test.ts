import { describe, expect, it } from 'vitest';
import { isPieceTrapped } from './pieceTrapped';

describe('isPieceTrapped', () => {
  it('is true for an attacked piece whose every move also loses it', () => {
    // Knight in the corner: b6 is covered by the pawn and the king, c7 by the king.
    expect(isPieceTrapped('N7/pk6/8/8/8/8/8/6K1 w - - 0 1', 'a8')).toBe(true);
  });

  it('gives the same answer when it is the other side to move', () => {
    expect(isPieceTrapped('N7/pk6/8/8/8/8/8/6K1 b - - 0 1', 'a8')).toBe(true);
  });

  it('is false when the piece has a safe square to go to', () => {
    // The pawn on a5 guards b6.
    expect(isPieceTrapped('N7/1k6/8/P7/8/8/8/6K1 w - - 0 1', 'a8')).toBe(false);
  });

  it('is true for an attacked piece that cannot move at all', () => {
    // The bishop on h1 is shut in by its own pawn and attacked by the rook on h8.
    expect(isPieceTrapped('4k2r/8/8/8/8/8/6P1/K6B w - - 0 1', 'h1')).toBe(true);
  });

  it('is false for a piece that cannot move but is not attacked', () => {
    expect(isPieceTrapped('4k3/8/8/8/8/1P6/2P5/N3K3 w - - 0 1', 'a1')).toBe(false);
  });

  it('is false for a pinned piece that is safe where it stands', () => {
    // The knight on f3 cannot move without losing the queen, but it is guarded twice.
    expect(isPieceTrapped('6k1/5ppp/8/8/6b1/5N2/5PPP/3QK3 w - - 0 1', 'f3')).toBe(false);
  });

  it('is false for an empty square', () => {
    expect(isPieceTrapped('N7/pk6/8/8/8/8/8/6K1 w - - 0 1', 'd4')).toBe(false);
  });
});
