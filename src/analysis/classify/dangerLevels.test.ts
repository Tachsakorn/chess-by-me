import { describe, expect, it } from 'vitest';
import { moveCreatesGreaterThreat, moveLeavesGreaterThreat } from './dangerLevels';

describe('moveLeavesGreaterThreat: the opponent takes the piece on offer', () => {
  it('is true when taking a minor piece allows mate in one', () => {
    // ...Rxd6 leaves the back rank and Re8 is mate.
    const fen = '3r2k1/5ppp/3N4/8/8/8/5PPP/4R1K1 b - - 0 1';
    expect(
      moveLeavesGreaterThreat(fen, { square: 'd6', piece: 'n' }, { from: 'd8', to: 'd6' }),
    ).toBe(true);
  });

  it('is false when taking the piece costs nothing', () => {
    // The same position without the white rook.
    const fen = '3r2k1/5ppp/3N4/8/8/8/5PPP/6K1 b - - 0 1';
    expect(
      moveLeavesGreaterThreat(fen, { square: 'd6', piece: 'n' }, { from: 'd8', to: 'd6' }),
    ).toBe(false);
  });

  it('does not count a mate threat as cover for a queen', () => {
    // ...Rxd6 still allows Re8 mate, but a queen on offer is not "pinned" by that.
    const fen = '3r2k1/5ppp/3Q4/8/8/8/5PPP/4R1K1 b - - 0 1';
    expect(
      moveLeavesGreaterThreat(fen, { square: 'd6', piece: 'q' }, { from: 'd8', to: 'd6' }),
    ).toBe(false);
  });

  it('is true when the capturing side is left with a piece of equal or greater value hanging', () => {
    // After ...Qxd6 the rook on a8 is still attacked by the bishop on g2.
    const fen = 'r5k1/2q2ppp/3N4/8/8/8/5PBP/6K1 b - - 0 1';
    expect(
      moveLeavesGreaterThreat(fen, { square: 'd6', piece: 'n' }, { from: 'c7', to: 'd6' }),
    ).toBe(true);
  });

  it('ignores hanging pieces worth less than the piece on offer', () => {
    // A queen is on offer; the rook hanging on a8 is not worth as much.
    const fen = 'r5k1/2q2ppp/3Q4/8/8/8/5PBP/6K1 b - - 0 1';
    expect(
      moveLeavesGreaterThreat(fen, { square: 'd6', piece: 'q' }, { from: 'c7', to: 'd6' }),
    ).toBe(false);
  });

  it('is false for a capture that is not legal', () => {
    // The king stands next to the knight, but the pawn on e6 guards it.
    const fen = '4k3/8/4p3/3n4/4K3/8/8/8 w - - 0 1';
    expect(
      moveLeavesGreaterThreat(fen, { square: 'd5', piece: 'n' }, { from: 'e4', to: 'd5' }),
    ).toBe(false);
  });
});

describe('moveCreatesGreaterThreat: the threatened piece moves away', () => {
  it('is true when moving it exposes a more valuable piece behind it', () => {
    // The knight on f3 shields the queen on d1 from the bishop on g4.
    const fen = '6k1/5ppp/8/8/6b1/5N2/5PPP/3QK3 w - - 0 1';
    expect(
      moveCreatesGreaterThreat(fen, { square: 'f3', piece: 'n' }, { from: 'f3', to: 'e5' }),
    ).toBe(true);
  });

  it('is false when nothing stands behind it', () => {
    const fen = '6k1/5ppp/8/8/6b1/5N2/5PPP/4K3 w - - 0 1';
    expect(
      moveCreatesGreaterThreat(fen, { square: 'f3', piece: 'n' }, { from: 'f3', to: 'e5' }),
    ).toBe(false);
  });

  it('is true when moving it allows mate in one', () => {
    // The rook guards the back rank; once it leaves, ...Re1 is mate.
    const fen = '4r1k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    expect(
      moveCreatesGreaterThreat(fen, { square: 'd1', piece: 'r' }, { from: 'd1', to: 'd7' }),
    ).toBe(true);
    expect(
      moveCreatesGreaterThreat(fen, { square: 'd1', piece: 'r' }, { from: 'd1', to: 'a1' }),
    ).toBe(false);
  });
});
