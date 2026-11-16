import { describe, expect, it } from 'vitest';
import { boardSquares, paletteFor, PALETTES } from './board';
import { PIECE_IMAGES } from './pieces';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('paletteFor', () => {
  it('gives a game the same colours every time', () => {
    expect(paletteFor('lichess:LAGvRNey')).toBe(paletteFor('lichess:LAGvRNey'));
  });

  it('spreads games over all four colour sets', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(paletteFor(`lichess:game${i}`));
    expect([...seen].sort()).toEqual([...PALETTES].sort());
  });
});

describe('boardSquares', () => {
  it('reads a position from White’s side, a8 first and light', () => {
    const squares = boardSquares(START, null, 'white');
    expect(squares).toHaveLength(64);
    expect(squares[0]).toMatchObject({ square: 'a8', light: true, piece: 'bR' });
    expect(squares[4]).toMatchObject({ square: 'e8', piece: 'bK' });
    expect(squares[63]).toMatchObject({ square: 'h1', light: true, piece: 'wR' });
    expect(squares[27]).toMatchObject({ square: 'd5', piece: null });
  });

  it('turns the board for Black', () => {
    const squares = boardSquares(START, null, 'black');
    expect(squares[0]).toMatchObject({ square: 'h1', piece: 'wR' });
    expect(squares[63]).toMatchObject({ square: 'a8', piece: 'bR' });
  });

  it('marks both squares of the last move', () => {
    const squares = boardSquares(START, 'e2e4', 'white');
    const marked = squares.filter((s) => s.moved).map((s) => s.square);
    expect(marked.sort()).toEqual(['e2', 'e4']);
  });
});

describe('PIECE_IMAGES', () => {
  it('has all twelve cburnett pieces from chessground', () => {
    expect(Object.keys(PIECE_IMAGES).sort()).toEqual(
      ['bB', 'bK', 'bN', 'bP', 'bQ', 'bR', 'wB', 'wK', 'wN', 'wP', 'wQ', 'wR'].sort(),
    );
    for (const url of Object.values(PIECE_IMAGES)) expect(url).toMatch(/^data:image\/svg\+xml/);
  });
});
