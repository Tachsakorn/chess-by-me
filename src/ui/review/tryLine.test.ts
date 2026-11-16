import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GameRecord } from '@/contract';
import {
  boardPosition,
  legalDests,
  promotes,
  reviewNavigate,
  type ReviewPosition,
} from './tryLine';

const game = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../fixtures/lichess-LAGvRNey/game.json', import.meta.url)),
    'utf8',
  ),
) as GameRecord;
// 1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4 Nf6 5. O-O Be7 6. e5 Ng4 7. Re1 O-O 8. h3 d5 ...
const at = (ply: number): ReviewPosition => ({ ply, flipped: false, line: null });
const play = (state: ReviewPosition, ...ucis: string[]) =>
  ucis.reduce((current, uci) => reviewNavigate(current, { play: uci }, game), state);

describe('reviewNavigate: playing a move on the board', () => {
  it('starts a line when the move is not the game move', () => {
    const next = play(at(15), 'g4h6');
    expect(next.ply).toBe(15); // the place in the game does not move
    expect(next.line).toMatchObject({ from: 15, at: 1 });
    expect(next.line!.moves).toHaveLength(1);
    expect(next.line!.moves[0]).toMatchObject({
      ply: 16,
      moveNumber: 8,
      color: 'black',
      san: 'Nh6',
      uci: 'g4h6',
      fenBefore: game.moves[14]!.fenAfter,
    });
    expect(next.stepped).toBe(true);
  });

  it('steps along the game when the move is the game move: no line', () => {
    const next = play(at(15), 'd7d5');
    expect(next).toMatchObject({ ply: 16, line: null, stepped: true });
  });

  it('starts a line from the starting position too', () => {
    const next = play(at(0), 'd2d4');
    expect(next.line).toMatchObject({ from: 0, at: 1 });
    expect(next.line!.moves[0]).toMatchObject({ ply: 1, moveNumber: 1, color: 'white', san: 'd4' });
  });

  it('ignores a move that is not legal', () => {
    const state = at(15);
    expect(play(state, 'g4g8')).toBe(state);
    expect(play(state, 'h3g4')).toBe(state); // White's move, but it is Black's turn
  });

  it('goes on in the line, for both sides', () => {
    const next = play(at(15), 'g4h6', 'c1h6', 'g7h6');
    expect(next.line).toMatchObject({ from: 15, at: 3 });
    expect(next.line!.moves.map((move) => move.san)).toEqual(['Nh6', 'Bxh6', 'gxh6']);
    expect(next.line!.moves.map((move) => move.ply)).toEqual([16, 17, 18]);
    expect(next.line!.moves[1]).toMatchObject({ moveNumber: 9, color: 'white' });
    expect(next.line!.moves[2]!.fenBefore).toBe(next.line!.moves[1]!.fenAfter);
  });

  it('cuts the moves after it when another move is played in the middle of the line', () => {
    const line = play(at(15), 'g4h6', 'c1h6', 'g7h6');
    const back = reviewNavigate(reviewNavigate(line, 'previous', game), 'previous', game);
    expect(back.line!.at).toBe(1);
    const other = play(back, 'a2a3');
    expect(other.line!.moves.map((move) => move.san)).toEqual(['Nh6', 'a3']);
    expect(other.line!.at).toBe(2);
  });

  it('keeps the rest of the line when the move played is the next one of the line', () => {
    const line = play(at(15), 'g4h6', 'c1h6', 'g7h6');
    const back = reviewNavigate(reviewNavigate(line, 'previous', game), 'previous', game);
    const again = play(back, 'c1h6');
    expect(again.line!.moves.map((move) => move.san)).toEqual(['Nh6', 'Bxh6', 'gxh6']);
    expect(again.line!.at).toBe(2);
    expect(again.stepped).toBe(true);
  });

  it('plays a reply only on the position it was found for', () => {
    const line = play(at(15), 'g4h6');
    const fen = line.line!.moves[0]!.fenAfter;
    const reply = reviewNavigate(line, { play: 'c1h6', on: fen }, game);
    expect(reply.line!.moves.map((move) => move.san)).toEqual(['Nh6', 'Bxh6']);
    // The same reply arriving again, after the board has moved on, does nothing.
    expect(reviewNavigate(reply, { play: 'c1h6', on: fen }, game)).toBe(reply);
    const elsewhere = reviewNavigate(at(15), { play: 'g4h6', on: fen }, game);
    expect(elsewhere.line).toBeNull();
  });

  it('writes a promotion with its piece', () => {
    const state: ReviewPosition = {
      ply: 0,
      flipped: false,
      line: {
        from: 0,
        at: 1,
        moves: [
          {
            ply: 1,
            moveNumber: 1,
            color: 'white',
            san: 'x',
            uci: 'a2a3',
            fenBefore: game.initialFen,
            fenAfter: '8/P6k/8/8/8/8/8/K7 w - - 0 1',
            clockSeconds: null,
            spentSeconds: null,
          },
        ],
      },
    };
    const next = reviewNavigate(state, { play: 'a7a8n' }, game);
    expect(next.line!.moves[1]).toMatchObject({ san: 'a8=N', uci: 'a7a8n' });
    // Without a piece the move is not a move.
    expect(reviewNavigate(state, { play: 'a7a8' }, game)).toBe(state);
  });
});

describe('reviewNavigate: the step buttons in a line', () => {
  const line = play(at(15), 'g4h6', 'c1h6', 'g7h6');

  it('previous steps back in the line', () => {
    const back = reviewNavigate(line, 'previous', game);
    expect(back.line).toMatchObject({ at: 2 });
    expect(back.line!.moves).toHaveLength(3);
    expect(back.stepped).toBe(false);
  });

  it('previous at the first move of the line returns to the game, where it was left', () => {
    const first = reviewNavigate(reviewNavigate(line, 'previous', game), 'previous', game);
    const out = reviewNavigate(first, 'previous', game);
    expect(out).toMatchObject({ ply: 15, line: null, stepped: false });
  });

  it('next goes to the next move of the line when there is one', () => {
    const back = reviewNavigate(line, 'previous', game);
    const forward = reviewNavigate(back, 'next', game);
    expect(forward.line).toMatchObject({ at: 3 });
    expect(forward.stepped).toBe(true);
  });

  it('next at the end of the line changes nothing by itself (the screen plays the best reply)', () => {
    expect(reviewNavigate(line, 'next', game)).toBe(line);
  });

  it('first and last return to the game and go to its start and its end', () => {
    expect(reviewNavigate(line, 'first', game)).toMatchObject({ ply: 0, line: null });
    expect(reviewNavigate(line, 'last', game)).toMatchObject({
      ply: game.moves.length,
      line: null,
    });
  });

  it('going to a move of the game leaves the line', () => {
    expect(reviewNavigate(line, { goTo: 30 }, game)).toMatchObject({ ply: 30, line: null });
  });

  it('exit returns to the game at the position the line left from', () => {
    expect(reviewNavigate(line, 'exit', game)).toMatchObject({
      ply: 15,
      line: null,
      stepped: false,
    });
  });

  it('exit outside a line changes nothing', () => {
    const state = at(15);
    expect(reviewNavigate(state, 'exit', game)).toBe(state);
  });

  it('flipping the board keeps the line', () => {
    const flipped = reviewNavigate(line, 'flip', game);
    expect(flipped.flipped).toBe(true);
    expect(flipped.line).toBe(line.line);
    expect(flipped.stepped).toBe(false);
  });
});

describe('reviewNavigate: in the game', () => {
  it('steps as before', () => {
    expect(reviewNavigate(at(15), 'next', game)).toMatchObject({ ply: 16, stepped: true });
    expect(reviewNavigate(at(15), 'previous', game)).toMatchObject({ ply: 14, stepped: false });
    expect(reviewNavigate(at(0), 'previous', game)).toMatchObject({ ply: 0 });
    expect(reviewNavigate(at(15), 'last', game).ply).toBe(game.moves.length);
  });
});

describe('boardPosition', () => {
  it('is the game position outside a line', () => {
    expect(boardPosition(game, at(16))).toEqual({
      fen: game.moves[15]!.fenAfter,
      lastMove: 'd7d5',
      turn: 'white',
    });
    expect(boardPosition(game, at(0))).toEqual({
      fen: game.initialFen,
      lastMove: null,
      turn: 'white',
    });
  });

  it('is the position after the line move on the board', () => {
    const line = play(at(15), 'g4h6', 'c1h6');
    expect(boardPosition(game, line)).toEqual({
      fen: line.line!.moves[1]!.fenAfter,
      lastMove: 'c1h6',
      turn: 'black',
    });
    const back = reviewNavigate(line, 'previous', game);
    expect(boardPosition(game, back)).toMatchObject({ lastMove: 'g4h6', turn: 'white' });
  });
});

describe('legalDests', () => {
  it('lists where each piece of the side to move can go', () => {
    const dests = legalDests(game.initialFen);
    expect(dests.get('e2')).toEqual(['e3', 'e4']);
    expect(dests.get('g1')?.sort()).toEqual(['f3', 'h3']);
    expect(dests.has('e7')).toBe(false);
    expect(dests.size).toBe(10);
  });

  it('is empty when the game is over', () => {
    expect(legalDests(game.moves.at(-1)!.fenAfter).size).toBe(0);
  });
});

describe('promotes', () => {
  it('is true for a pawn reaching the last row, and only then', () => {
    const fen = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
    expect(promotes(fen, 'a7', 'a8')).toBe(true);
    expect(promotes(fen, 'a1', 'a2')).toBe(false);
    expect(promotes(game.initialFen, 'e2', 'e4')).toBe(false);
  });
});
