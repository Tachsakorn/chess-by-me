import { describe, expect, it } from 'vitest';
import { isMiss, type MissInput } from './miss';

// The opponent blundered from a level game (the mover went from 0.5 to 0.8 expected
// points) and the reply gave it all back.
const gaveItBack: MissInput = {
  category: 'blunder',
  opponentPrevious: 'blunder',
  moverBeforeOpponentMove: 0.5,
  moverBefore: 0.8,
  moverAfter: 0.5,
};

describe('isMiss', () => {
  it('is true when the opponent just blundered and the reply let the advantage go', () => {
    expect(isMiss(gaveItBack)).toBe(true);
  });

  it('counts mistakes as well as blunders, on both sides', () => {
    expect(isMiss({ ...gaveItBack, category: 'mistake', opponentPrevious: 'mistake' })).toBe(true);
  });

  it('is true when the mover was worse before the gift and is no worse than that now', () => {
    // 0.47 -> (opponent errs) 0.66 -> (reply) 0.46: the chance is gone, nothing else is.
    const input: MissInput = {
      category: 'mistake',
      opponentPrevious: 'mistake',
      moverBeforeOpponentMove: 0.47,
      moverBefore: 0.66,
      moverAfter: 0.46,
    };
    expect(isMiss(input)).toBe(true);
  });

  it('is true for a forced mate that was handed over and not taken', () => {
    expect(isMiss({ ...gaveItBack, category: 'mistake', moverBefore: 1 })).toBe(true);
  });

  it.each(['best', 'excellent', 'good', 'inaccuracy'] as const)(
    'is false when the reply itself is only %s',
    (category) => {
      expect(isMiss({ ...gaveItBack, category })).toBe(false);
    },
  );

  it.each(['best', 'excellent', 'good', 'inaccuracy', null] as const)(
    'is false when the opponent’s previous move was %s, not a mistake or blunder',
    (opponentPrevious) => {
      expect(isMiss({ ...gaveItBack, opponentPrevious })).toBe(false);
    },
  );

  it('needs a clear advantage on offer: at least 0.62 expected points before the reply', () => {
    expect(isMiss({ ...gaveItBack, moverBefore: 0.62, moverAfter: 0.5 })).toBe(true);
    expect(isMiss({ ...gaveItBack, moverBefore: 0.61, moverAfter: 0.48 })).toBe(false);
  });

  // Fable review A1-04 (2026-11-15): when both sides trade blunders, a move that leaves the
  // mover worse than equal is an error in its own right, not a Miss. The same floor as a
  // Brilliant move: at least 0.455 expected points after the move.
  it('needs the mover at least equal after the reply: 0.455 expected points or more', () => {
    const traded: MissInput = {
      category: 'blunder',
      opponentPrevious: 'blunder',
      moverBeforeOpponentMove: 0.08, // White was already lost (about -7)
      moverBefore: 0.9, // Black's blunder handed White a winning game
      moverAfter: 0.1, // 4.h4 gives it all back: -6.3
    };
    expect(isMiss(traded)).toBe(false);
    expect(isMiss({ ...gaveItBack, moverBeforeOpponentMove: 0.5, moverAfter: 0.455 })).toBe(true);
    expect(isMiss({ ...gaveItBack, moverBeforeOpponentMove: 0.5, moverAfter: 0.45 })).toBe(false);
  });

  it('is false when the reply loses more than the opponent had given', () => {
    // Over the two moves the mover is down 0.09 or more: that is an error of its own.
    const better = { ...gaveItBack, moverBeforeOpponentMove: 0.6, moverBefore: 0.9 };
    expect(isMiss({ ...better, moverAfter: 0.53 })).toBe(true);
    expect(isMiss({ ...better, moverAfter: 0.51 })).toBe(false);
    expect(isMiss({ ...better, moverAfter: 0 })).toBe(false);
  });
});
