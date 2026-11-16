import { describe, expect, it } from 'vitest';
import type { PositionEval, Score } from '@/contract';
import { expectedPoints } from '@/analysis/classify/expectedPoints';
import { evalBar } from './evalBarState';

const at = (score: Score): PositionEval => ({
  ply: 10,
  fen: '8/8/8/8/8/8/8/8 w - - 0 1',
  score,
  whiteExpected: expectedPoints(score),
  depth: 18,
  lines: [],
  source: 'engine',
});

describe('evalBar', () => {
  it('fills White’s share from White’s win chance, not the raw score', () => {
    const bar = evalBar(at({ kind: 'cp', value: 250 }));
    expect(bar.white).toBeCloseTo(expectedPoints({ kind: 'cp', value: 250 }), 10);
    expect(bar).toMatchObject({ ready: true, leader: 'white', text: '+2.5' });
  });

  it('gives Black the lead below zero', () => {
    expect(evalBar(at({ kind: 'cp', value: -30 }))).toMatchObject({
      leader: 'black',
      text: '−0.3',
    });
  });

  it('calls a level position equal', () => {
    expect(evalBar(at({ kind: 'cp', value: 4 }))).toMatchObject({ leader: 'equal', text: '0.0' });
  });

  it('fills the whole bar for a forced mate, written #3 or −#3', () => {
    expect(evalBar(at({ kind: 'mate', moves: 3, winner: 'white' }))).toMatchObject({
      white: 1,
      leader: 'white',
      text: '#3',
    });
    expect(evalBar(at({ kind: 'mate', moves: 3, winner: 'black' }))).toMatchObject({
      white: 0,
      leader: 'black',
      text: '−#3',
    });
  });

  it('fills the whole bar for the winner once the game is mated', () => {
    expect(evalBar(at({ kind: 'over', winner: 'black' }))).toMatchObject({
      white: 0,
      leader: 'black',
    });
  });

  it('writes whole pawns from ten up, so the figure fits the iPad bar', () => {
    expect(evalBar(at({ kind: 'cp', value: 1234 })).text).toBe('+12');
    expect(evalBar(at({ kind: 'cp', value: -998 })).text).toBe('−10');
    expect(evalBar(at({ kind: 'cp', value: 949 })).text).toBe('+9.5');
  });

  it('stands at the middle, not ready, before the position is analysed', () => {
    expect(evalBar(undefined)).toEqual({ ready: false, white: 0.5, leader: null, text: null });
  });
});
