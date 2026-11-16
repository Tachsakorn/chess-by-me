import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GameAnalysis, GameRecord } from '@/contract';
import { graphPoints, plyAtFraction } from './graph';

const root = fileURLToPath(new URL('../../../fixtures/lichess-LAGvRNey/', import.meta.url));
const game = JSON.parse(readFileSync(`${root}game.json`, 'utf8')) as GameRecord;
const analysis = JSON.parse(readFileSync(`${root}analysis-lite.json`, 'utf8')) as GameAnalysis;
const last = game.moves.length;

describe('graphPoints', () => {
  it('runs from the start to the last move, left to right', () => {
    const points = graphPoints(analysis.positions, last);
    expect(points).toHaveLength(last + 1);
    expect(points[0]).toMatchObject({ ply: 0, x: 0 });
    expect(points.at(-1)).toMatchObject({ ply: last, x: 1 });
  });

  it("puts White's winning chances at the top", () => {
    const points = graphPoints(analysis.positions, last);
    const position = analysis.positions[20]!;
    expect(points[20]!.y).toBeCloseTo(1 - position.whiteExpected, 10);
    // The game ends in mate by White: the line finishes at the very top.
    expect(points.at(-1)!.y).toBe(0);
  });

  it('stops where the analysis has not arrived yet', () => {
    const partial = analysis.positions.slice(0, 31);
    const points = graphPoints(partial, last);
    expect(points).toHaveLength(31);
    expect(points.at(-1)!.x).toBeCloseTo(30 / last, 10);
    expect(graphPoints([], last)).toEqual([]);
  });

  it('copes with a game that has no moves', () => {
    expect(graphPoints(analysis.positions.slice(0, 1), 0)).toEqual([
      { ply: 0, x: 0, y: 1 - analysis.positions[0]!.whiteExpected },
    ]);
  });
});

describe('plyAtFraction', () => {
  it('finds the move nearest to a place along the graph', () => {
    expect(plyAtFraction(0, last)).toBe(0);
    expect(plyAtFraction(1, last)).toBe(last);
    expect(plyAtFraction(16 / last, last)).toBe(16);
    expect(plyAtFraction(16.4 / last, last)).toBe(16);
    expect(plyAtFraction(16.6 / last, last)).toBe(17);
  });

  it('stays inside the game when the finger leaves the graph', () => {
    expect(plyAtFraction(-0.3, last)).toBe(0);
    expect(plyAtFraction(1.7, last)).toBe(last);
    expect(plyAtFraction(0.5, 0)).toBe(0);
  });
});
