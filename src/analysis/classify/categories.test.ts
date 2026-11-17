import { describe, expect, it } from 'vitest';
import type { Color, Score } from '@/contract';
import { categoryByRules, categoryForLoss } from './categories';

const cp = (value: number): Score => ({ kind: 'cp', value });
const mate = (moves: number, winner: Color): Score => ({ kind: 'mate', moves, winner });

describe('categoryForLoss', () => {
  it.each([
    [0, 'best'],
    [0.0099, 'best'],
    [0.01, 'excellent'],
    [0.0449, 'excellent'],
    [0.045, 'good'],
    [0.0499, 'good'],
    // Chess.com's published error lines (owner, 2026-11-17): 0.05 / 0.10 / 0.20.
    [0.05, 'inaccuracy'],
    [0.0999, 'inaccuracy'],
    [0.1, 'mistake'],
    [0.1999, 'mistake'],
    [0.2, 'blunder'],
    // WintrChess's old lines are no longer lines.
    [0.0799, 'inaccuracy'],
    [0.08, 'inaccuracy'],
    [0.12, 'mistake'],
    [0.2199, 'blunder'],
    [1, 'blunder'],
  ] as const)('a loss of %s expected points is %s', (loss, category) => {
    expect(categoryForLoss(loss)).toBe(category);
  });
});

describe('categoryByRules: centipawns before and after', () => {
  it('uses the point-loss ladder for White', () => {
    // +300 -> 0 loses 0.2408 expected points.
    expect(categoryByRules(cp(300), cp(0), 'white')).toBe('blunder');
    // +100 -> +40 loses 0.5866 - 0.5349 = 0.0517: an Inaccuracy since the 0.05 line.
    expect(categoryByRules(cp(100), cp(40), 'white')).toBe('inaccuracy');
    // +100 -> +50 loses 0.5866 - 0.5437 = 0.0429.
    expect(categoryByRules(cp(100), cp(50), 'white')).toBe('excellent');
  });

  it('uses the point-loss ladder for Black, whose scores run the other way', () => {
    expect(categoryByRules(cp(-300), cp(0), 'black')).toBe('blunder');
    expect(categoryByRules(cp(0), cp(-300), 'black')).toBe('best');
  });

  it('calls a move that loses nothing best', () => {
    expect(categoryByRules(cp(25), cp(60), 'white')).toBe('best');
  });
});

describe('categoryByRules: mate before and after', () => {
  it('is best when the mover brings the mate closer', () => {
    expect(categoryByRules(mate(2, 'white'), mate(1, 'white'), 'white')).toBe('best');
    expect(categoryByRules(mate(5, 'black'), mate(4, 'black'), 'black')).toBe('best');
  });

  it.each([
    [2, 'excellent'], // same distance
    [3, 'excellent'], // one move longer
    [4, 'good'], // two moves longer
    [6, 'good'], // four moves longer
    [8, 'good'], // six moves longer
    [9, 'inaccuracy'], // seven moves longer
    [20, 'inaccuracy'],
  ] as const)(
    'from mate in 2 to mate in %s for the mover is %s, never a mistake',
    (moves, category) => {
      expect(categoryByRules(mate(2, 'white'), mate(moves, 'white'), 'white')).toBe(category);
    },
  );

  it('is best for the side being mated to keep the mate as far away as it was', () => {
    expect(categoryByRules(mate(3, 'black'), mate(3, 'black'), 'white')).toBe('best');
    expect(categoryByRules(mate(3, 'black'), mate(5, 'black'), 'white')).toBe('best');
  });

  it('marks the side being mated down for walking into a quicker mate', () => {
    expect(categoryByRules(mate(3, 'black'), mate(2, 'black'), 'white')).toBe('excellent');
    expect(categoryByRules(mate(3, 'black'), mate(1, 'black'), 'white')).toBe('good');
  });

  it('is a blunder to turn a forced mate into being mated within three moves', () => {
    expect(categoryByRules(mate(2, 'white'), mate(1, 'black'), 'white')).toBe('blunder');
    expect(categoryByRules(mate(2, 'white'), mate(3, 'black'), 'white')).toBe('blunder');
    expect(categoryByRules(mate(4, 'black'), mate(3, 'white'), 'black')).toBe('blunder');
  });

  // Fable review A1-01: the whole game is thrown away, so never milder than the ladder's Blunder.
  it('is a blunder to turn a forced mate into being mated in four moves or more', () => {
    expect(categoryByRules(mate(2, 'white'), mate(4, 'black'), 'white')).toBe('blunder');
  });
});

// Fable review A1-01 (2026-11-15): the mate table alone gave "mate in 1 -> +2.5" an Inaccuracy
// although 29% of the win chance was gone. The label is now never milder than the plain
// expected-points ladder gives for the same loss; the table still makes it harsher.
describe('categoryByRules: a forced mate for the mover is lost', () => {
  it.each([
    [1400, 'excellent'], // ladder: best (0.7% lost); the table's excellent stands
    [1000, 'excellent'],
    [800, 'inaccuracy'], // 5.7% lost (Good before the 0.05 line)
    [400, 'mistake'], // 19.8% lost
    [250, 'blunder'], // 29% lost (was an inaccuracy)
    [200, 'blunder'],
    [0, 'blunder'],
    [-500, 'blunder'],
  ] as const)('leaving the mover at %s centipawns is %s', (value, category) => {
    expect(categoryByRules(mate(3, 'white'), cp(value), 'white')).toBe(category);
    expect(categoryByRules(mate(3, 'black'), cp(-value), 'black')).toBe(category);
  });

  it('is a blunder to stalemate the opponent instead of mating (half the win chance gone)', () => {
    expect(categoryByRules(mate(1, 'white'), { kind: 'over', winner: null }, 'white')).toBe(
      'blunder',
    );
  });
});

describe('categoryByRules: the mover was being mated and the mate is gone', () => {
  // WintrChess would grade this on the centipawn score alone and call it a
  // blunder; nothing was lost, so here it is best (see docs/sources/classification.md).
  it('is best, whatever the new score', () => {
    expect(categoryByRules(mate(4, 'black'), cp(-900), 'white')).toBe('best');
    expect(categoryByRules(mate(4, 'white'), cp(900), 'black')).toBe('best');
  });

  it('is best when the mover turns the tables and now has the forced mate', () => {
    expect(categoryByRules(mate(3, 'black'), mate(2, 'white'), 'white')).toBe('best');
  });
});

describe('categoryByRules: centipawns before, mate after', () => {
  it('is best to reach a forced mate for the mover', () => {
    expect(categoryByRules(cp(350), mate(5, 'white'), 'white')).toBe('best');
    expect(categoryByRules(cp(-350), mate(5, 'black'), 'black')).toBe('best');
  });

  // For a side that was already lost the table decides: the quicker the mate, the worse.
  it.each([
    [1, 'blunder'],
    [2, 'blunder'],
    [3, 'mistake'],
    [5, 'mistake'],
    [6, 'inaccuracy'],
    [12, 'inaccuracy'],
  ] as const)('allowing a forced mate in %s when already lost is %s', (moves, category) => {
    expect(categoryByRules(cp(900), mate(moves, 'white'), 'black')).toBe(category);
    expect(categoryByRules(cp(-900), mate(moves, 'black'), 'white')).toBe(category);
  });

  // Fable review A1-01: allowing a mate from a won or level game throws the game away.
  it.each([
    [800, 8], // +8.0 -> mated in 8: 94% lost (was an inaccuracy)
    [300, 8], // 74% lost (was an inaccuracy)
    [-50, 4], // 46% lost (was a mistake)
    [200, 12],
  ] as const)('allowing a mate from %s centipawns is a blunder', (value, moves) => {
    expect(categoryByRules(cp(value), mate(moves, 'black'), 'white')).toBe('blunder');
    expect(categoryByRules(cp(-value), mate(moves, 'white'), 'black')).toBe('blunder');
  });
});

describe('categoryByRules: the game ends with the move', () => {
  it('is best to deliver checkmate', () => {
    expect(categoryByRules(mate(1, 'white'), { kind: 'over', winner: 'white' }, 'white')).toBe(
      'best',
    );
    expect(categoryByRules(cp(-100), { kind: 'over', winner: 'black' }, 'black')).toBe('best');
  });

  it('grades a move that ends the game in a draw on the points given up', () => {
    // +300 -> draw loses 0.2408.
    expect(categoryByRules(cp(300), { kind: 'over', winner: null }, 'white')).toBe('blunder');
    expect(categoryByRules(cp(-300), { kind: 'over', winner: null }, 'white')).toBe('best');
  });
});
