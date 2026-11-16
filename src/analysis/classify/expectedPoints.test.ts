import { describe, expect, it } from 'vitest';
import type { Score } from '@/contract';
import { expectedPoints, pointLoss } from './expectedPoints';

const cp = (value: number): Score => ({ kind: 'cp', value });

describe('expectedPoints', () => {
  it('gives an equal position exactly half a point', () => {
    expect(expectedPoints(cp(0))).toBe(0.5);
  });

  it('is symmetric around 0.5', () => {
    for (const value of [1, 35, 100, 250, 700, 1500]) {
      expect(expectedPoints(cp(value)) + expectedPoints(cp(-value))).toBeCloseTo(1, 12);
    }
  });

  it('rises strictly with the centipawn score', () => {
    const values = [-2000, -900, -300, -100, -10, 0, 10, 100, 300, 900, 2000];
    const points = values.map((value) => expectedPoints(cp(value)));
    for (let i = 1; i < points.length; i++) {
      expect(points[i]).toBeGreaterThan(points[i - 1] ?? Infinity);
    }
  });

  // Hand-computed from 1 / (1 + e^(-0.0035 * cp)):
  // e^-0.35 = 0.704688 -> 0.586618; e^-1.05 = 0.349938 -> 0.740775.
  it('matches the WintrChess curve at +100 and +300 centipawns', () => {
    expect(expectedPoints(cp(100))).toBeCloseTo(0.5866, 4);
    expect(expectedPoints(cp(300))).toBeCloseTo(0.7408, 4);
    expect(expectedPoints(cp(-300))).toBeCloseTo(0.2592, 4);
  });

  it('counts a forced mate as a full point for the side delivering it', () => {
    expect(expectedPoints({ kind: 'mate', moves: 1, winner: 'white' })).toBe(1);
    expect(expectedPoints({ kind: 'mate', moves: 12, winner: 'white' })).toBe(1);
    expect(expectedPoints({ kind: 'mate', moves: 3, winner: 'black' })).toBe(0);
  });

  it('scores a finished game by its winner', () => {
    expect(expectedPoints({ kind: 'over', winner: 'white' })).toBe(1);
    expect(expectedPoints({ kind: 'over', winner: 'black' })).toBe(0);
    expect(expectedPoints({ kind: 'over', winner: null })).toBe(0.5);
  });
});

describe('pointLoss', () => {
  it('is zero when the position did not get worse for White as the mover', () => {
    expect(pointLoss(cp(50), cp(50), 'white')).toBe(0);
    expect(pointLoss(cp(50), cp(120), 'white')).toBe(0);
  });

  it('is zero when the position did not get worse for Black as the mover', () => {
    expect(pointLoss(cp(50), cp(50), 'black')).toBe(0);
    expect(pointLoss(cp(50), cp(-80), 'black')).toBe(0);
  });

  it('is what White gave up when the score drops', () => {
    // 0.740775 - 0.5 = 0.240775
    expect(pointLoss(cp(300), cp(0), 'white')).toBeCloseTo(0.2408, 4);
  });

  it('is what Black gave up when the score rises', () => {
    // Black held 1 - 0.5 = 0.5 and keeps 1 - 0.740775 = 0.259225.
    expect(pointLoss(cp(0), cp(300), 'black')).toBeCloseTo(0.2408, 4);
  });

  it('is zero when a forced mate for the mover only gets longer', () => {
    expect(
      pointLoss(
        { kind: 'mate', moves: 2, winner: 'white' },
        { kind: 'mate', moves: 6, winner: 'white' },
        'white',
      ),
    ).toBe(0);
  });

  it('is a full point when a forced mate turns into a forced mate for the opponent', () => {
    expect(
      pointLoss(
        { kind: 'mate', moves: 2, winner: 'black' },
        { kind: 'mate', moves: 1, winner: 'white' },
        'black',
      ),
    ).toBe(1);
  });

  it('is zero for the move that delivers checkmate', () => {
    expect(
      pointLoss(
        { kind: 'mate', moves: 1, winner: 'white' },
        { kind: 'over', winner: 'white' },
        'white',
      ),
    ).toBe(0);
  });
});
