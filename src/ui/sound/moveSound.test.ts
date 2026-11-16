import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GameMove, GameRecord } from '@/contract';
import { reviewNavigate, type ReviewAction, type ReviewPosition } from '@/ui/review/tryLine';
import { moveSoundKind, soundFor } from './moveSound';

const game = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../fixtures/lichess-LAGvRNey/game.json', import.meta.url)),
    'utf8',
  ),
) as GameRecord;
// 1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4 Nf6 5. O-O ... 39. Rag7+ ... 43. Rh8# (85 plies)
const at = (ply: number): ReviewPosition => ({ ply, flipped: false, line: null });

/** The sound one action makes, from `state`. */
function sound(state: ReviewPosition, action: ReviewAction, repeat = false, record = game) {
  const after = reviewNavigate(state, action, record);
  return soundFor(record, state, after, action, repeat);
}

const move = (san: string, uci: string): GameMove => ({
  ply: 1,
  moveNumber: 1,
  color: 'white',
  san,
  uci,
  fenBefore: '',
  fenAfter: '',
  clockSeconds: null,
  spentSeconds: null,
});

describe('moveSoundKind', () => {
  it('names the sound of a move from what it did', () => {
    expect(moveSoundKind(move('e4', 'e2e4'), false)).toBe('move');
    expect(moveSoundKind(move('O-O', 'e1g1'), false)).toBe('move'); // castling is a move
    expect(moveSoundKind(move('exd5', 'e4d5'), false)).toBe('capture');
    expect(moveSoundKind(move('Qh5+', 'd1h5'), false)).toBe('check');
    expect(moveSoundKind(move('Qxf7+', 'h5f7'), false)).toBe('check'); // check wins over capture
    expect(moveSoundKind(move('a8=Q', 'a7a8q'), false)).toBe('end'); // promotion
    expect(moveSoundKind(move('bxa8=N+', 'b7a8n'), false)).toBe('end');
    expect(moveSoundKind(move('Qxf7#', 'h5f7'), false)).toBe('end'); // mate ends the game
    expect(moveSoundKind(move('Kh1', 'g1h1'), true)).toBe('end'); // the game's last move
  });
});

describe('soundFor: stepping through the game one move at a time', () => {
  it('plays the move that comes onto the board with Next', () => {
    expect(sound(at(0), 'next')).toBe('move'); // 1. e4
    expect(sound(at(5), 'next')).toBe('capture'); // 3... exd4
    expect(sound(at(8), 'next')).toBe('move'); // 5. O-O
    expect(sound(at(76), 'next')).toBe('check'); // 39. Rag7+
    expect(sound(at(84), 'next')).toBe('end'); // 43. Rh8#
  });

  it('plays the move taken back with Previous', () => {
    expect(sound(at(6), 'previous')).toBe('capture'); // takes back 3... exd4
    expect(sound(at(1), 'previous')).toBe('move');
  });

  it('plays the end sound on the last move of a game that ended without mate', () => {
    const resigned = { ...game, moves: game.moves.slice(0, 77) }; // ends on 39. Rag7+
    expect(sound(at(76), 'next', false, resigned)).toBe('end');
    // Taking that move back is only a check.
    expect(sound(at(77), 'previous', false, resigned)).toBe('check');
  });

  it('plays nothing when nothing moves', () => {
    expect(sound(at(85), 'next')).toBeNull();
    expect(sound(at(0), 'previous')).toBeNull();
  });
});

describe('soundFor: silent actions', () => {
  it('plays nothing for a jump to the start or the end', () => {
    expect(sound(at(30), 'first')).toBeNull();
    expect(sound(at(30), 'last')).toBeNull();
  });

  it('plays nothing for a tap on the graph or a move in the list', () => {
    expect(sound(at(30), { goTo: 31 })).toBeNull();
    expect(sound(at(30), { goTo: 10 })).toBeNull();
  });

  it('plays nothing while a step button is held down (the steps that repeat)', () => {
    expect(sound(at(5), 'next', true)).toBeNull();
    expect(sound(at(6), 'previous', true)).toBeNull();
  });

  it('plays nothing to flip the board or leave a line', () => {
    expect(sound(at(30), 'flip')).toBeNull();
    const line = reviewNavigate(at(15), { play: 'g4h6' }, game);
    expect(sound(line, 'exit')).toBeNull();
  });
});

describe('soundFor: trying a move of your own', () => {
  it('plays the move made on the board', () => {
    expect(sound(at(15), { play: 'g4h6' })).toBe('move'); // 8... Nh6, a line
    expect(sound(at(15), { play: 'd7d5' })).toBe('move'); // 8... d5, the game move
    const line = reviewNavigate(at(15), { play: 'g4h6' }, game);
    expect(sound(line, { play: 'c1h6' })).toBe('capture'); // 9. Bxh6
  });

  it("plays the engine's reply (played the same way, with the position it is for)", () => {
    const line = reviewNavigate(at(15), { play: 'g4h6' }, game);
    const on = line.line!.moves[0]!.fenAfter;
    expect(sound(line, { play: 'c1h6', on })).toBe('capture');
  });

  it('plays nothing for a move that is not legal, or a reply meant for another position', () => {
    expect(sound(at(15), { play: 'g4g8' })).toBeNull();
    expect(sound(at(15), { play: 'g4h6', on: 'not this position' })).toBeNull();
  });

  it('steps through a line with Next and Previous like the game', () => {
    const two = [{ play: 'g4h6' }, { play: 'c1h6' }].reduce(
      (state, action) => reviewNavigate(state, action, game),
      at(15),
    );
    expect(sound(two, 'previous')).toBe('capture'); // takes back 9. Bxh6
    const back = reviewNavigate(two, 'previous', game);
    expect(sound(back, 'next')).toBe('capture');
    expect(sound(back, 'previous')).toBe('move'); // takes back 8... Nh6, back to the game
  });

  it('plays the end sound for a mate made in a line', () => {
    // 1. f3 e5 2. g4 Qh4#
    const start = { ...game, moves: [] };
    const line = [{ play: 'f2f3' }, { play: 'e7e5' }, { play: 'g2g4' }].reduce(
      (state, action) => reviewNavigate(state, action, start),
      at(0),
    );
    expect(sound(line, { play: 'd8h4' }, false, start)).toBe('end');
  });
});
