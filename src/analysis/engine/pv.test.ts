import { describe, expect, it } from 'vitest';
import { walkLine } from './pv';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6, White to move and able to castle short.
const RUY = 'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 5';
// Hand-built: both sides may castle on either wing.
const BOTH_WINGS = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
const STANDARD = { maxPlies: 10, kingToRookCastling: false };
const CLOUD = { maxPlies: 10, kingToRookCastling: true };

describe('walkLine', () => {
  it('gives SAN for each UCI move, same length', () => {
    expect(walkLine(START, ['e2e4', 'e7e5', 'g1f3'], STANDARD)).toEqual({
      uci: ['e2e4', 'e7e5', 'g1f3'],
      san: ['e4', 'e5', 'Nf3'],
    });
  });

  it('cuts the line at maxPlies', () => {
    const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'];
    const walked = walkLine(START, moves, { maxPlies: 4, kingToRookCastling: false });
    expect(walked.uci).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    expect(walked.san).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('cuts the line at the first illegal move', () => {
    expect(walkLine(START, ['e2e4', 'e7e5', 'e1e3', 'b8c6'], STANDARD)).toEqual({
      uci: ['e2e4', 'e7e5'],
      san: ['e4', 'e5'],
    });
  });

  it('cuts the line at a token that is not a move', () => {
    expect(walkLine(START, ['e2e4', '(none)', 'e7e5'], STANDARD).uci).toEqual(['e2e4']);
    expect(walkLine(START, ['', 'e2e4'], STANDARD).uci).toEqual([]);
  });

  it('cuts the line at a move that carries a promotion piece it cannot have', () => {
    expect(walkLine(START, ['e2e4q', 'e7e5'], STANDARD)).toEqual({ uci: [], san: [] });
    expect(walkLine(START, ['e2e4', 'e7e5q'], STANDARD).uci).toEqual(['e2e4']);
  });

  it('leaves the position usable after a rejected move: later lines start clean', () => {
    // Two walks from the same FEN do not share state.
    expect(walkLine(START, ['e2e5'], STANDARD).uci).toEqual([]);
    expect(walkLine(START, ['e2e4'], STANDARD).san).toEqual(['e4']);
  });

  it('gives an empty line when the first move is illegal', () => {
    expect(walkLine(START, ['e7e5'], STANDARD)).toEqual({ uci: [], san: [] });
  });

  it('reads standard castling', () => {
    expect(walkLine(RUY, ['e1g1', 'f8e7'], STANDARD)).toEqual({
      uci: ['e1g1', 'f8e7'],
      san: ['O-O', 'Be7'],
    });
  });

  it('turns king-takes-rook castling into standard castling when asked to', () => {
    expect(walkLine(RUY, ['e1h1', 'f6e4', 'f1e1'], CLOUD)).toEqual({
      uci: ['e1g1', 'f6e4', 'f1e1'],
      san: ['O-O', 'Nxe4', 'Re1'],
    });
  });

  it('handles all four castling moves written as king takes rook', () => {
    const blackToMove = BOTH_WINGS.replace(' w ', ' b ');
    expect(walkLine(BOTH_WINGS, ['e1h1'], CLOUD)).toEqual({ uci: ['e1g1'], san: ['O-O'] });
    expect(walkLine(BOTH_WINGS, ['e1a1'], CLOUD)).toEqual({ uci: ['e1c1'], san: ['O-O-O'] });
    expect(walkLine(blackToMove, ['e8h8'], CLOUD)).toEqual({ uci: ['e8g8'], san: ['O-O'] });
    expect(walkLine(blackToMove, ['e8a8'], CLOUD)).toEqual({ uci: ['e8c8'], san: ['O-O-O'] });
  });

  it('treats king-takes-rook as illegal unless asked to accept it', () => {
    expect(walkLine(RUY, ['e1h1', 'f6e4'], STANDARD)).toEqual({ uci: [], san: [] });
  });

  it('does not invent castling when the right to castle is gone', () => {
    // Same squares as RUY but White has lost the right to castle short.
    const noRights = 'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w Qkq - 2 5';
    expect(walkLine(noRights, ['e1h1'], CLOUD)).toEqual({ uci: [], san: [] });
  });

  it('keeps a real king move to a rook square as it is', () => {
    // Hand-built: the white king on g1 takes a black rook on h1.
    const fen = '4k3/8/8/8/8/8/8/6Kr w - - 0 1';
    expect(walkLine(fen, ['g1h1'], CLOUD)).toEqual({ uci: ['g1h1'], san: ['Kxh1'] });
  });

  it('reads promotions', () => {
    const fen = '8/4P1k1/8/8/8/8/8/4K3 w - - 0 1';
    expect(walkLine(fen, ['e7e8q', 'g7f6'], STANDARD)).toEqual({
      uci: ['e7e8q', 'g7f6'],
      san: ['e8=Q', 'Kf6'],
    });
    // A promotion without its piece letter is not a complete move.
    expect(walkLine(fen, ['e7e8'], STANDARD).uci).toEqual([]);
  });

  it('stops when the game ends inside the line', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
    expect(walkLine(fen, ['a1a8', 'g8h8'], STANDARD)).toEqual({ uci: ['a1a8'], san: ['Ra8#'] });
  });
});
