import { describe, expect, it } from 'vitest';
import { isCriticalCandidate, isGreat } from './great';
import { context, cp, mate, over } from './testSupport';

// After 1. e4 e5 2. Nf3 Nc6; White plays 3. Bc4. The scores are hand-built.
const QUIET = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
const QUIET_MOVE = 'f1c4';

describe('isGreat', () => {
  it('is true when the second-best move gives up 0.1 expected points or more', () => {
    // +100 against -100: 0.5866 - 0.4134 = 0.1732.
    const ctx = context(QUIET, QUIET_MOVE, { first: cp(100), second: cp(-100), after: cp(100) });
    expect(isGreat(ctx)).toBe(true);
  });

  it('draws the line at exactly 0.1', () => {
    // +100 is 0.586618. -15 is 0.486878 (gap 0.09974); -16 is 0.486003 (gap 0.10062).
    const below = context(QUIET, QUIET_MOVE, { first: cp(100), second: cp(-15), after: cp(100) });
    const above = context(QUIET, QUIET_MOVE, { first: cp(100), second: cp(-16), after: cp(100) });
    expect(isGreat(below)).toBe(false);
    expect(isGreat(above)).toBe(true);
  });

  it('works for Black, whose scores run the other way', () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const good = context(afterE4, 'e7e5', { first: cp(-100), second: cp(100), after: cp(-100) });
    const easy = context(afterE4, 'e7e5', { first: cp(-100), second: cp(-90), after: cp(-100) });
    expect(isGreat(good)).toBe(true);
    expect(isGreat(easy)).toBe(false);
  });

  it('cannot be awarded without a second engine line', () => {
    const ctx = context(QUIET, QUIET_MOVE, { first: cp(100), after: cp(100) });
    expect(isGreat(ctx)).toBe(false);
  });

  it('is false when the mover is still worse after the move', () => {
    const ctx = context(QUIET, QUIET_MOVE, { first: cp(-20), second: cp(-400), after: cp(-20) });
    expect(isGreat(ctx)).toBe(false);
  });

  it('is false when the move leaves the mover with a forced mate', () => {
    const ctx = context(QUIET, QUIET_MOVE, {
      first: mate(3, 'white'),
      second: cp(200),
      after: mate(2, 'white'),
    });
    expect(isGreat(ctx)).toBe(false);
  });

  it('is false when the mover was in check and had to answer it', () => {
    // After 1. e4 e5 2. f3 Qh4+; White blocks with 3. g3.
    const inCheck = 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5P2/PPPP2PP/RNBQKBNR w KQkq - 1 3';
    const ctx = context(inCheck, 'g2g3', { first: cp(10), second: cp(-300), after: cp(10) });
    expect(isGreat(ctx)).toBe(false);
  });

  it('is false for a queen promotion but allowed for an underpromotion', () => {
    const promotion = '8/P7/8/8/8/5k2/8/7K w - - 0 1';
    const scores = { first: cp(600), second: cp(100), after: cp(600) };
    expect(isGreat(context(promotion, 'a7a8q', scores))).toBe(false);
    expect(isGreat(context(promotion, 'a7a8r', scores))).toBe(true);
  });

  it('is false for the capture of a piece that was simply hanging', () => {
    const hanging = '4k3/8/8/3n4/8/8/3R4/4K3 w - - 0 1';
    const ctx = context(hanging, 'd2d5', { first: cp(500), second: cp(-100), after: cp(500) });
    expect(isGreat(ctx)).toBe(false);
  });

  it('is allowed for the capture of a piece that was defended', () => {
    const defended = '4k3/8/4p3/3n4/8/8/3R4/4K3 w - - 0 1';
    const ctx = context(defended, 'd2d5', { first: cp(500), second: cp(-100), after: cp(500) });
    expect(isGreat(ctx)).toBe(true);
  });

  it('looks at the pawn actually removed when the capture is en passant', () => {
    const scores = { first: cp(300), second: cp(-100), after: cp(300) };
    // The pawn on d5 is undefended: taking it en passant is taking free material.
    const free = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
    expect(isGreat(context(free, 'e5d6', scores))).toBe(false);
    // With a pawn on c7 ready to take back on d6, the d5 pawn was defended.
    const guarded = '4k3/2p5/8/3pP3/8/8/8/4K3 w - d6 0 1';
    expect(isGreat(context(guarded, 'e5d6', scores))).toBe(true);
  });
});

describe('isCriticalCandidate', () => {
  it('is false when the second-best move would still leave the mover 7 pawns up', () => {
    const won = context(QUIET, QUIET_MOVE, { first: cp(1200), second: cp(700), after: cp(1200) });
    const close = context(QUIET, QUIET_MOVE, { first: cp(1200), second: cp(699), after: cp(1200) });
    expect(isCriticalCandidate(won)).toBe(false);
    expect(isCriticalCandidate(close)).toBe(true);
  });

  it('falls back on the score after the move when there is no second line', () => {
    const won = context(QUIET, QUIET_MOVE, { first: cp(700), after: cp(700) });
    const close = context(QUIET, QUIET_MOVE, { first: cp(699), after: cp(699) });
    expect(isCriticalCandidate(won)).toBe(false);
    expect(isCriticalCandidate(close)).toBe(true);
  });

  it('does not rule a move out because the second-best move is also a forced mate', () => {
    const ctx = context(QUIET, QUIET_MOVE, {
      first: mate(2, 'white'),
      second: mate(5, 'white'),
      after: mate(1, 'white'),
    });
    expect(isCriticalCandidate(ctx)).toBe(true);
  });

  it('is false when the move leaves the mover worse or facing a forced mate', () => {
    const worse = context(QUIET, QUIET_MOVE, { first: cp(-1), second: cp(-200), after: cp(-1) });
    const mated = context(QUIET, QUIET_MOVE, {
      first: cp(0),
      second: cp(-200),
      after: mate(4, 'black'),
    });
    const level = context(QUIET, QUIET_MOVE, { first: cp(0), second: cp(-200), after: cp(0) });
    expect(isCriticalCandidate(worse)).toBe(false);
    expect(isCriticalCandidate(mated)).toBe(false);
    expect(isCriticalCandidate(level)).toBe(true);
  });

  it('accepts a move that ends the game in a draw', () => {
    // ...Qf2 stalemates the king on h1: a drawn end counts as level, not as losing.
    const stalemate = '7k/8/8/8/8/6q1/8/7K b - - 0 1';
    const ctx = context(stalemate, 'g3f2', {
      first: cp(-900),
      second: cp(-200),
      after: over(null),
    });
    expect(isCriticalCandidate(ctx)).toBe(true);
  });
});
