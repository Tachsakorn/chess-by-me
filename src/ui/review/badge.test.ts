import { describe, expect, it } from 'vitest';
import { badgeFor, badgeSpot, bookRange, calloutPlace, listBadge } from './badge';

describe('badgeFor', () => {
  it('gives a badge to the categories the owner chose, with their marks', () => {
    expect(badgeFor('brilliant')).toEqual({ tone: 'brilliant', mark: '!!', callout: true });
    expect(badgeFor('great')).toEqual({ tone: 'great', mark: '!', callout: false });
    expect(badgeFor('book')).toEqual({ tone: 'book', mark: 'book', callout: false });
    expect(badgeFor('inaccuracy')).toEqual({ tone: 'inaccuracy', mark: '?!', callout: false });
    expect(badgeFor('mistake')).toEqual({ tone: 'mistake', mark: '?', callout: false });
    expect(badgeFor('miss')).toEqual({ tone: 'miss', mark: '×', callout: false });
    expect(badgeFor('blunder')).toEqual({ tone: 'blunder', mark: '??', callout: false });
  });

  // Owner, 2026-11-15 (second design): every category has a badge on the board.
  it('gives Best a star and Excellent and Good a tick', () => {
    expect(badgeFor('best')).toEqual({ tone: 'best', mark: 'star', callout: false });
    expect(badgeFor('excellent')).toEqual({ tone: 'excellent', mark: 'check', callout: false });
    expect(badgeFor('good')).toEqual({ tone: 'good', mark: 'check', callout: false });
  });
});

describe('badgeSpot', () => {
  it('finds the square on the screen, White at the bottom', () => {
    expect(badgeSpot('a8', 'white')).toEqual({ column: 0, row: 0 });
    expect(badgeSpot('h1', 'white')).toEqual({ column: 7, row: 7 });
    expect(badgeSpot('e4', 'white')).toEqual({ column: 4, row: 4 });
  });

  it('finds the square on the screen, Black at the bottom', () => {
    expect(badgeSpot('a8', 'black')).toEqual({ column: 7, row: 7 });
    expect(badgeSpot('h1', 'black')).toEqual({ column: 0, row: 0 });
    expect(badgeSpot('e4', 'black')).toEqual({ column: 3, row: 3 });
  });
});

describe('calloutPlace', () => {
  // A 350px board: squares of 43.75px; a callout 100px wide and 26px high.
  const board = 350;
  const size = { width: 100, height: 26 };

  it('centres the callout on the middle of the top edge of the square', () => {
    // e4 with White at the bottom: column 4, row 4. Middle of its top edge: x 196.875, y 175.
    expect(calloutPlace({ column: 4, row: 4 }, size, board)).toEqual({ left: 146.875, top: 162 });
  });

  it('moves it in from the left and right edges, 4px from the edge', () => {
    expect(calloutPlace({ column: 0, row: 4 }, size, board).left).toBe(4);
    expect(calloutPlace({ column: 7, row: 4 }, size, board).left).toBe(350 - 4 - 100);
  });

  it('puts it inside the square on the top row, 4px from the top', () => {
    expect(calloutPlace({ column: 3, row: 0 }, size, board).top).toBe(4);
  });
});

describe('listBadge', () => {
  // The move lists (owner, 2026-11-15): the notable categories only, and Book on the first and
  // the last book move. Book here runs from ply 1 to ply 7.
  const book = { first: 1, last: 7 };

  it('marks the notable moves', () => {
    for (const category of [
      'brilliant',
      'great',
      'inaccuracy',
      'mistake',
      'miss',
      'blunder',
    ] as const) {
      expect(listBadge(category, 20, book)?.tone).toBe(category);
    }
  });

  it('leaves Best, Excellent and Good without a badge', () => {
    expect(listBadge('best', 20, book)).toBeNull();
    expect(listBadge('excellent', 20, book)).toBeNull();
    expect(listBadge('good', 20, book)).toBeNull();
  });

  it('gives a book move labelled as an error its own badge (Fable A1-05)', () => {
    expect(listBadge('mistake', 3, book)?.tone).toBe('mistake');
  });

  it('marks Book only on the first and the last book move', () => {
    expect(listBadge('book', 1, book)?.mark).toBe('book');
    expect(listBadge('book', 7, book)?.mark).toBe('book');
    expect(listBadge('book', 4, book)).toBeNull();
    expect(listBadge('book', 4, null)).toBeNull();
  });
});

describe('bookRange', () => {
  it('finds the first and the last move labelled Book', () => {
    expect(bookRange(['book', 'book', 'book', 'best', 'good'])).toEqual({ first: 1, last: 3 });
  });

  it('is null when no move is Book (no opening, or not analysed yet)', () => {
    expect(bookRange(['best', 'good'])).toBeNull();
    expect(bookRange([undefined, undefined])).toBeNull();
  });

  // Owner, 2026-11-15 (Fable review A1-05): a book move that is a real error is not Book.
  it('skips a book move labelled as an error in the middle of the book', () => {
    expect(bookRange(['book', 'book', 'mistake', 'book', 'best'])).toEqual({ first: 1, last: 4 });
  });

  it('ends the range before a book move labelled as an error at the end of the book', () => {
    // 1. e4 d5 2. Nf3 (Tennison Gambit, a Mistake): Book on 1. e4 and 1...d5.
    expect(bookRange(['book', 'book', 'mistake', 'best'])).toEqual({ first: 1, last: 2 });
  });

  it('starts the range after a first move labelled as an error', () => {
    expect(bookRange(['inaccuracy', 'book', 'book', 'best'])).toEqual({ first: 2, last: 3 });
  });
});
