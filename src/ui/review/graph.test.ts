import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GameAnalysis, GameRecord } from '@/contract';
import {
  GRAPH_DOT_R,
  GRAPH_DOT_R_CURRENT,
  GRAPH_INSET,
  GRAPH_LINE_W,
  graphHeight,
  graphPoints,
  graphX,
  graphY,
  plyAtFraction,
  plyAtX,
} from './graph';

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

describe('graphY', () => {
  // A game whose chances reach both edges: White mated at once, then Black (made up for the test).
  const edges = [0.5, 1, 0, 0.5].map((whiteExpected) => ({ whiteExpected })) as never[];

  it('keeps the biggest dot and the line whole at both edges, at every graph height', () => {
    expect(GRAPH_INSET).toBe(Math.max(GRAPH_DOT_R, GRAPH_DOT_R_CURRENT) + GRAPH_LINE_W);
    const points = graphPoints(edges, 3);
    expect(points.map((p) => p.y)).toEqual([0.5, 0, 1, 0.5]);
    for (const height of [28, 36, 54, 72]) {
      const top = graphY(0, height);
      const bottom = graphY(1, height);
      expect(top - GRAPH_DOT_R_CURRENT - GRAPH_LINE_W).toBeGreaterThanOrEqual(0);
      expect(bottom + GRAPH_DOT_R_CURRENT + GRAPH_LINE_W).toBeLessThanOrEqual(height);
      expect(top - GRAPH_LINE_W / 2).toBeGreaterThanOrEqual(0);
      expect(bottom + GRAPH_LINE_W / 2).toBeLessThanOrEqual(height);
    }
  });

  it('still puts an even game in the middle and keeps the order', () => {
    expect(graphY(0.5, 36)).toBe(18);
    expect(graphY(0.25, 36)).toBeLessThan(graphY(0.75, 36));
  });
});

// Round 4 of 1.1: on a narrow phone the dot of a move near the end stuck out ~0.7px on the right.
describe('graphX', () => {
  it('keeps the biggest dot and the line whole at the left and right edges, at every width', () => {
    for (const width of [300, 335, 362, 600]) {
      const left = graphX(0, width);
      const right = graphX(1, width);
      expect(left).toBe(GRAPH_INSET);
      expect(right).toBe(width - GRAPH_INSET);
      expect(left - GRAPH_DOT_R_CURRENT - GRAPH_LINE_W).toBeGreaterThanOrEqual(0);
      expect(right + GRAPH_DOT_R_CURRENT + GRAPH_LINE_W).toBeLessThanOrEqual(width);
    }
  });

  it('puts the middle of the game in the middle', () => {
    expect(graphX(0.5, 300)).toBe(150);
  });
});

describe('plyAtX', () => {
  const width = 335;

  it('goes to the move whose dot is under the finger, at every move', () => {
    for (const lastPly of [1, 10, last, 300]) {
      for (let ply = 0; ply <= lastPly; ply += 1) {
        expect(plyAtX(graphX(ply / lastPly, width), width, lastPly)).toBe(ply);
      }
    }
  });

  it('goes to the first move at the left edge and the last at the right edge', () => {
    expect(plyAtX(0, width, last)).toBe(0);
    expect(plyAtX(GRAPH_INSET / 2, width, last)).toBe(0);
    expect(plyAtX(width, width, last)).toBe(last);
    expect(plyAtX(width - GRAPH_INSET / 2, width, last)).toBe(last);
  });

  it('stays inside the game when the finger leaves the graph', () => {
    expect(plyAtX(-40, width, last)).toBe(0);
    expect(plyAtX(width + 40, width, last)).toBe(last);
    expect(plyAtX(100, width, 0)).toBe(0);
    expect(plyAtX(5, 0, last)).toBe(0);
  });
});

describe('graphHeight', () => {
  it('is 36 when the board takes all the height', () => {
    expect(graphHeight({ byWidth: 400, byHeight: 300, short: false, wide: false })).toBe(36);
    expect(graphHeight({ byWidth: 300, byHeight: 300, short: false, wide: false })).toBe(36);
  });

  it('grows by what the board leaves, up to 72', () => {
    expect(graphHeight({ byWidth: 328, byHeight: 337, short: false, wide: false })).toBe(45);
    expect(graphHeight({ byWidth: 328, byHeight: 364, short: false, wide: false })).toBe(72);
    expect(graphHeight({ byWidth: 328, byHeight: 900, short: false, wide: false })).toBe(72);
  });

  it('is 28 on a short screen and 72 in the side column of a landscape iPad', () => {
    expect(graphHeight({ byWidth: 256, byHeight: 400, short: true, wide: false })).toBe(28);
    expect(graphHeight({ byWidth: 900, byHeight: 600, short: false, wide: true })).toBe(72);
  });
});
