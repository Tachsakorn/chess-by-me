import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Color, GameAnalysis, GameRecord, PositionEval, Score } from '@/contract';
import { computeAccuracy } from './gameAccuracy';

const readJson = <T>(relative: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')) as T;

/** A position carrying only what accuracy reads: the score. */
const pos = (ply: number, score: Score): PositionEval => ({
  ply,
  fen: '',
  score,
  whiteExpected: 0.5,
  depth: 0,
  lines: [],
  source: 'engine',
});
const cp = (value: number): Score => ({ kind: 'cp', value });
const alternating = (n: number): Color[] =>
  Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 'white' : 'black'));

describe('computeAccuracy on a real game (fixtures/lichess-LAGvRNey)', () => {
  const analysis = readJson<GameAnalysis>('../../../fixtures/lichess-LAGvRNey/analysis.json');
  const game = readJson<GameRecord>('../../../fixtures/lichess-LAGvRNey/game.json');
  const colors = game.moves.map((m) => m.color);
  const result = computeAccuracy(analysis.positions, colors);

  it('gives one accuracy per move, each within 0..100', () => {
    expect(result.perMove).toHaveLength(85);
    for (const a of result.perMove) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(100);
    }
  });

  it('gives both players a game accuracy within 0..100, the winner higher', () => {
    for (const a of [result.white, result.black]) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(100);
    }
    expect(result.white).toBeGreaterThan(result.black);
  });

  it('scores the checkmating move 100', () => {
    expect(analysis.positions.at(-1)?.score).toEqual({ kind: 'over', winner: 'white' });
    expect(result.perMove.at(-1)).toBe(100);
  });
});

describe('computeAccuracy on small games', () => {
  it('gives the side that loses 30 win points the lower accuracy', () => {
    // Move 1 (White) keeps 50; move 2 (Black) drops Black from 50 to about 20.
    const positions = [pos(0, cp(0)), pos(1, cp(0)), pos(2, cp(400))];
    const r = computeAccuracy(positions, ['white', 'black']);
    expect(r.perMove[0]).toBe(100);
    expect(r.perMove[1]).toBeLessThan(40);
    expect(r.black).toBeLessThan(r.white);
  });

  it('counts mate-in-3 becoming mate-in-5 for the same side as no loss', () => {
    const positions = [
      pos(0, { kind: 'mate', moves: 3, winner: 'white' }),
      pos(1, { kind: 'mate', moves: 5, winner: 'white' }),
    ];
    expect(computeAccuracy(positions, ['white']).perMove[0]).toBe(100);
  });

  it('gives 100, not more, when a move improves the mover position', () => {
    const positions = [pos(0, cp(0)), pos(1, cp(300)), pos(2, cp(-200))];
    const r = computeAccuracy(positions, ['white', 'black']);
    expect(r.perMove).toEqual([100, 100]);
    expect(r.white).toBe(100);
    expect(r.black).toBe(100);
  });

  it('handles a drawn finish', () => {
    const positions = [pos(0, cp(0)), pos(1, { kind: 'over', winner: null })];
    const r = computeAccuracy(positions, ['white']);
    expect(r.perMove).toEqual([100]);
  });

  // Lichess gives no accuracy at all when either side has no move (its own
  // tests: "empty game" and "single move" both yield None). Our interface
  // needs numbers, so a side with no moves gets 100: it lost nothing.
  it('gives 100 to both sides of a game with no moves', () => {
    const r = computeAccuracy([pos(0, cp(20))], []);
    expect(r).toEqual({ perMove: [], white: 100, black: 100 });
  });

  it('gives a one-move game a real number for the mover and 100 for the other side', () => {
    const r = computeAccuracy([pos(0, cp(20)), pos(1, cp(-300))], ['white']);
    expect(r.perMove).toHaveLength(1);
    expect(r.white).toBeGreaterThanOrEqual(0);
    expect(r.white).toBeLessThan(60);
    expect(Number.isNaN(r.white)).toBe(false);
    expect(r.black).toBe(100);
  });

  it('gives a two-move game numbers within 0..100', () => {
    const r = computeAccuracy([pos(0, cp(20)), pos(1, cp(-300)), pos(2, cp(-300))], alternating(2));
    for (const a of [r.white, r.black, ...r.perMove]) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(100);
    }
  });

  it('works when Black moves first', () => {
    const r = computeAccuracy(
      [pos(0, cp(0)), pos(1, cp(400)), pos(2, cp(400))],
      ['black', 'white'],
    );
    expect(r.black).toBeLessThan(r.white);
  });

  it('rejects mismatched lengths', () => {
    expect(() => computeAccuracy([pos(0, cp(0))], ['white'])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cross-check against Lichess's own reported accuracy.
// Fixture: __fixtures__/lichess-analysed.ndjson (see the README beside it).
// ---------------------------------------------------------------------------

interface LichessEval {
  eval?: number;
  mate?: number;
}
interface LichessGame {
  id: string;
  winner?: Color;
  moves: string;
  analysis: LichessEval[];
  players: Record<Color, { analysis: { accuracy: number } }>;
}

/** Lichess falls back to +15 cp for the start position when none is stored. */
const LICHESS_INITIAL_CP = 15;

function lichessScore(e: LichessEval, winner: Color | undefined): Score {
  if (e.eval !== undefined) return cp(e.eval);
  if (e.mate === undefined) throw new Error('eval entry without eval or mate');
  if (e.mate === 0) return { kind: 'over', winner: winner ?? null };
  return { kind: 'mate', moves: Math.abs(e.mate), winner: e.mate > 0 ? 'white' : 'black' };
}

function positionsFromLichess(game: LichessGame): { positions: PositionEval[]; colors: Color[] } {
  const positions = [
    pos(0, cp(LICHESS_INITIAL_CP)),
    ...game.analysis.map((e, i) => pos(i + 1, lichessScore(e, game.winner))),
  ];
  return { positions, colors: alternating(game.analysis.length) };
}

describe('computeAccuracy matches Lichess', () => {
  const games = readFileSync(
    fileURLToPath(new URL('./__fixtures__/lichess-analysed.ndjson', import.meta.url)),
    'utf8',
  )
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as LichessGame);

  it('has at least 5 games to compare', () => {
    expect(games.length).toBeGreaterThanOrEqual(5);
  });

  for (const game of games) {
    it(`is within 1.0 of Lichess for both players in ${game.id}`, () => {
      const { positions, colors } = positionsFromLichess(game);
      const r = computeAccuracy(positions, colors);
      expect(Math.abs(r.white - game.players.white.analysis.accuracy)).toBeLessThanOrEqual(1);
      expect(Math.abs(r.black - game.players.black.analysis.accuracy)).toBeLessThanOrEqual(1);
    });
  }
});
