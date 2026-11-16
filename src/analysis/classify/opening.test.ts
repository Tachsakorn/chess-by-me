import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { GameRecord } from '@/contract';
import gameJson from '../../../fixtures/lichess-LAGvRNey/game.json';
import { findOpening, loadOpeningBook, type OpeningBook } from './opening';

const game = gameJson as GameRecord;

/** The FEN after each move of a line given in SAN, as chess.js writes it. */
function fensAfter(sans: readonly string[]): string[] {
  const board = new Chess();
  return sans.map((san) => {
    board.move(san);
    return board.fen();
  });
}

describe('loadOpeningBook', () => {
  it('loads the Lichess opening list keyed by EPD', async () => {
    const book = await loadOpeningBook();
    expect(book['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -']).toEqual([
      'B00',
      "King's Pawn Game",
    ]);
    // 3865 rows in a.tsv to e.tsv at the pinned commit, no two rows for one position.
    expect(Object.keys(book)).toHaveLength(3865);
  });
});

describe('findOpening with the real book', () => {
  it('names the fixture game and finds where it leaves the book', async () => {
    const book = await loadOpeningBook();
    const opening = findOpening(
      book,
      game.moves.map((move) => move.fenAfter),
    );
    // 1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4 Nf6 5. O-O Be7 is the last named position;
    // 6. e5 leaves the list.
    expect(opening).toEqual({
      eco: 'C56',
      name: 'Italian Game: Scotch Gambit, de Riviere Defense',
      lastBookPly: 10,
    });
  });

  it('recognises an opening reached by another move order', async () => {
    const book = await loadOpeningBook();
    // The list has this position as 1. d4 d5 2. Nf3.
    const transposed = findOpening(book, fensAfter(['Nf3', 'd5', 'd4']));
    expect(transposed).toEqual({
      eco: 'D02',
      name: "Queen's Pawn Game: Zukertort Variation",
      lastBookPly: 3,
    });
    expect(findOpening(book, fensAfter(['d4', 'd5', 'Nf3']))).toEqual(transposed);
  });

  it('keeps the last named position when the following moves are not in the list', async () => {
    const book = await loadOpeningBook();
    expect(findOpening(book, fensAfter(['e4', 'e5', 'Ke2', 'Ke7', 'Ke1']))).toEqual({
      eco: 'C20',
      name: 'Bongcloud Attack',
      lastBookPly: 3,
    });
  });

  it('finds a position whose FEN records the en passant square after every double step', async () => {
    const book = await loadOpeningBook();
    // chess.js writes "-" here because no pawn can capture on e3; other tools write "e3".
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    expect(findOpening(book, [fen])).toEqual({
      eco: 'B00',
      name: "King's Pawn Game",
      lastBookPly: 1,
    });
  });

  it('returns null for an empty move list', async () => {
    expect(findOpening(await loadOpeningBook(), [])).toBeNull();
  });
});

describe('findOpening with a hand-built book', () => {
  // In the real list every one of the 20 first moves is named, so "outside every
  // book line from move one" can only be shown with a smaller book.
  const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -';
  const afterE4E5Nf3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -';
  const book: OpeningBook = {
    [afterE4]: ['B00', "King's Pawn Game"],
    [afterE4E5Nf3]: ['C40', "King's Knight Opening"],
  };

  it('returns null when the first move is outside every book line', () => {
    expect(findOpening(book, fensAfter(['d4', 'd5', 'c4']))).toBeNull();
  });

  it('uses the highest ply in the book even when an earlier position is not listed', () => {
    // After 1. e4 e5 the position is not in this small book; after 2. Nf3 it is again.
    expect(findOpening(book, fensAfter(['e4', 'e5', 'Nf3', 'Nc6']))).toEqual({
      eco: 'C40',
      name: "King's Knight Opening",
      lastBookPly: 3,
    });
  });
});
