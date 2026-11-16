import { describe, expect, it } from 'vitest';
import { winPercent, winPercentFromCp } from './winPercent';

// Lichess (scalachess eval.scala) treats every mate and every finished game
// as if the evaluation were the ±1000 cp ceiling, so a won position is about
// 97.5, not 100. See docs/sources/accuracy-rating.md.
const CEILING_WIN = winPercentFromCp(1000);

describe('winPercentFromCp', () => {
  it('is 50 for an equal position', () => {
    expect(winPercentFromCp(0)).toBe(50);
  });

  it('is symmetric around 50', () => {
    for (const cp of [1, 35, 100, 250, 999, 1000, 5000]) {
      expect(winPercentFromCp(cp) + winPercentFromCp(-cp)).toBeCloseTo(100, 10);
    }
  });

  it('gives 59.1 for one pawn', () => {
    expect(winPercentFromCp(100)).toBeCloseTo(59.1, 1);
  });

  it('clamps beyond ±1000 cp to the ±1000 result', () => {
    expect(winPercentFromCp(1500)).toBe(winPercentFromCp(1000));
    expect(winPercentFromCp(-99999)).toBe(winPercentFromCp(-1000));
    expect(winPercentFromCp(1000)).toBeCloseTo(97.54, 2);
  });
});

describe('winPercent', () => {
  it('reads a cp score', () => {
    expect(winPercent({ kind: 'cp', value: 100 })).toBe(winPercentFromCp(100));
  });

  it('treats a mate for White as the cp ceiling', () => {
    expect(winPercent({ kind: 'mate', moves: 3, winner: 'white' })).toBe(CEILING_WIN);
  });

  it('treats a mate for Black as the negative cp ceiling', () => {
    expect(winPercent({ kind: 'mate', moves: 1, winner: 'black' })).toBeCloseTo(
      100 - CEILING_WIN,
      10,
    );
  });

  it('scores a finished game by its winner', () => {
    expect(winPercent({ kind: 'over', winner: 'white' })).toBe(CEILING_WIN);
    expect(winPercent({ kind: 'over', winner: 'black' })).toBeCloseTo(100 - CEILING_WIN, 10);
    expect(winPercent({ kind: 'over', winner: null })).toBe(50);
  });
});
