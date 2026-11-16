import { describe, expect, it } from 'vitest';
import { toWhiteScore } from './score';

describe('toWhiteScore', () => {
  it('keeps a centipawn score when White is to move', () => {
    expect(toWhiteScore({ kind: 'cp', value: 40 }, true)).toEqual({ kind: 'cp', value: 40 });
    expect(toWhiteScore({ kind: 'cp', value: -15 }, true)).toEqual({ kind: 'cp', value: -15 });
  });

  it('flips a centipawn score when Black is to move', () => {
    expect(toWhiteScore({ kind: 'cp', value: 40 }, false)).toEqual({ kind: 'cp', value: -40 });
    expect(toWhiteScore({ kind: 'cp', value: -40 }, false)).toEqual({ kind: 'cp', value: 40 });
  });

  it('never produces negative zero', () => {
    const score = toWhiteScore({ kind: 'cp', value: 0 }, false);
    expect(score.kind === 'cp' && Object.is(score.value, 0)).toBe(true);
  });

  it('names the winner of a mate for the side to move', () => {
    expect(toWhiteScore({ kind: 'mate', value: 2 }, false)).toEqual({
      kind: 'mate',
      moves: 2,
      winner: 'black',
    });
    expect(toWhiteScore({ kind: 'mate', value: 3 }, true)).toEqual({
      kind: 'mate',
      moves: 3,
      winner: 'white',
    });
  });

  it('names the winner of a mate against the side to move', () => {
    expect(toWhiteScore({ kind: 'mate', value: -1 }, false)).toEqual({
      kind: 'mate',
      moves: 1,
      winner: 'white',
    });
    expect(toWhiteScore({ kind: 'mate', value: -4 }, true)).toEqual({
      kind: 'mate',
      moves: 4,
      winner: 'black',
    });
  });
});
