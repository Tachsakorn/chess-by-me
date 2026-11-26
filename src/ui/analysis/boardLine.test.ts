import { describe, expect, it } from 'vitest';
import type { OpeningBook } from '@/analysis';
import {
  BOARD_GAME,
  bookMoves,
  boardReducer,
  EMPTY_BOARD,
  fenAt,
  MAX_PLIES,
  movesFromParam,
  movesToParam,
  START_FEN,
  type Board,
} from './boardLine';

const play = (board: Board, ...ucis: string[]) =>
  ucis.reduce((state, uci) => boardReducer(state, { play: uci }), board);

describe('boardReducer', () => {
  it('plays legal moves and numbers them', () => {
    const board = play(EMPTY_BOARD, 'e2e4', 'e7e5', 'g1f3');
    expect(board.ply).toBe(3);
    expect(board.moves.map((m) => [m.ply, m.moveNumber, m.color, m.san])).toEqual([
      [1, 1, 'white', 'e4'],
      [2, 1, 'black', 'e5'],
      [3, 2, 'white', 'Nf3'],
    ]);
    expect(board.stepped).toBe(true);
  });

  it('leaves the board as it is for a move that is not legal', () => {
    const board = play(EMPTY_BOARD, 'e2e4');
    expect(boardReducer(board, { play: 'e2e5' })).toBe(board);
    // A promotion needs its piece.
    expect(boardReducer(EMPTY_BOARD, { play: 'e2e4q' })).toBe(EMPTY_BOARD);
  });

  it('steps forward when the move is the next one of the line, keeping the rest', () => {
    const line = play(EMPTY_BOARD, 'e2e4', 'e7e5', 'g1f3');
    const back = boardReducer(boardReducer(line, 'first'), { play: 'e2e4' });
    expect(back.ply).toBe(1);
    expect(back.moves).toBe(line.moves);
  });

  it('replaces the rest of the line with another move', () => {
    const line = play(EMPTY_BOARD, 'e2e4', 'e7e5', 'g1f3');
    const other = boardReducer(boardReducer(line, { goTo: 1 }), { play: 'c7c5' });
    expect(other.ply).toBe(2);
    expect(other.moves.map((m) => m.san)).toEqual(['e4', 'c5']);
  });

  it('steps, jumps and flips within the line', () => {
    const line = play(EMPTY_BOARD, 'e2e4', 'e7e5');
    expect(boardReducer(line, 'first').ply).toBe(0);
    expect(boardReducer(line, 'previous').ply).toBe(1);
    expect(boardReducer(boardReducer(line, 'first'), 'last').ply).toBe(2);
    expect(boardReducer(line, 'next').ply).toBe(2);
    expect(boardReducer(line, { goTo: 9 }).ply).toBe(2);
    expect(boardReducer(line, 'flip').flipped).toBe(true);
    expect(fenAt(boardReducer(line, 'first'))).toBe(START_FEN);
    expect(fenAt(line)).toBe(line.moves[1]!.fenAfter);
  });
});

describe('the moves in the address', () => {
  it('go there and back', () => {
    const line = play(EMPTY_BOARD, 'e2e4', 'e7e5', 'g1f3');
    expect(movesToParam(line.moves)).toBe('e2e4,e7e5,g1f3');
    expect(movesFromParam('e2e4,e7e5,g1f3')).toEqual(line.moves);
  });

  it('stop at the first move that is not legal, and at the limit', () => {
    expect(movesFromParam('e2e4,zz,e7e5').map((m) => m.san)).toEqual(['e4']);
    expect(movesFromParam(null)).toEqual([]);
    expect(movesFromParam('')).toEqual([]);
    const knights = Array.from({ length: MAX_PLIES + 40 }, (_, i) =>
      ['g1f3', 'g8f6', 'f3g1', 'f6g8'][i % 4],
    ).join(',');
    expect(movesFromParam(knights)).toHaveLength(MAX_PLIES);
  });
});

describe('bookMoves', () => {
  // A book of three positions after 1. e4 e5 2. Nf3 Nc6: 3. Bb5, 3. Bc4 and 3. d4.
  const book: OpeningBook = {
    'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -': ['C60', 'Ruy Lopez'],
    'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -': ['C50', 'Italian Game'],
    'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq -': ['C44', 'Scotch Game'],
  };
  const fen = fenAt(play(EMPTY_BOARD, 'e2e4', 'e7e5', 'g1f3', 'b8c6'));

  it('lists the moves that reach a book position', () => {
    expect(bookMoves(book, fen).sort()).toEqual(['Bb5', 'Bc4', 'd4']);
    expect(bookMoves(book, fen, 2)).toHaveLength(2);
    expect(bookMoves(book, START_FEN)).toEqual([]);
  });

  it('puts the broadest names first, as the book has no counts', () => {
    const withSideLine: OpeningBook = {
      ...book,
      // 3. Nxe5, a side line with a long name
      'r1bqkbnr/pppp1ppp/2n5/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq -': [
        'C44',
        "King's Knight Opening: Irish Gambit",
      ],
    };
    expect(bookMoves(withSideLine, fen)).toEqual(['Bb5', 'd4', 'Bc4']);
  });

  it('puts the moves the engine prefers first, in its order', () => {
    expect(bookMoves(book, fen, 3, ['d4', 'Nc3', 'Bc4'])).toEqual(['d4', 'Bc4', 'Bb5']);
  });
});

describe('BOARD_GAME', () => {
  it('starts from the normal position with no moves', () => {
    expect(BOARD_GAME.initialFen).toBe(START_FEN);
    expect(BOARD_GAME.moves).toEqual([]);
  });
});
