import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateGameAnalysis, type AnalysisEvent, type GameRecord } from '@/contract';
import { createAnalyzeGame } from './analyzeGame';
import { loadOpeningBook } from './classify';
import { UciEngine } from './engine';
import { createNodeTransport } from './engine/testing/nodeTransport';

// The real engine (Stockfish 17.1 lite build, run by Node) on a real game, start to finish.
const game = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../fixtures/lichess-LAGvRNey/game.json', import.meta.url)),
    'utf8',
  ),
) as GameRecord;

describe('analyzeGame with the real lite engine', () => {
  it('analyses a whole real game and delivers a valid analysis', async () => {
    const events: AnalysisEvent[] = [];
    const analyzeGame = createAnalyzeGame({
      createEngine: (variant) => new UciEngine(createNodeTransport(variant)),
      loadOpeningBook,
    });
    await new Promise<void>((resolve) => {
      analyzeGame(game, { engine: 'lite', depth: 10, useCloudEval: false }, (event) => {
        events.push(event);
        if (event.type === 'completed' || event.type === 'failed') resolve();
      });
    });

    const last = events.at(-1);
    if (last?.type !== 'completed') throw new Error(`expected completed: ${JSON.stringify(last)}`);
    const { analysis } = last;
    expect(validateGameAnalysis(analysis, game)).toEqual([]);
    expect(analysis.engine).toEqual({
      name: 'Stockfish',
      version: '17.1',
      variant: 'lite',
      depth: 10,
      multiPv: 2,
    });
    expect(analysis.opening).toMatchObject({ eco: 'C56', lastBookPly: 10 });
    expect(analysis.positions).toHaveLength(86);
    for (const position of analysis.positions.slice(0, 85)) {
      expect(position.source).toBe('engine');
      expect(position.depth).toBe(10);
    }
    expect(analysis.positions.at(-1)).toMatchObject({
      source: 'rules',
      score: { kind: 'over', winner: 'white' },
    });
    // The checkmating move is best, and the moves before the book ends are book.
    expect(analysis.moves.at(-1)?.category).toBe('best');
    expect(analysis.moves.slice(0, 10).every((m) => m.category === 'book')).toBe(true);
    expect(analysis.white.accuracy).toBeGreaterThan(analysis.black.accuracy);
    expect(events.filter((e) => e.type === 'position')).toHaveLength(86);
    expect(events.filter((e) => e.type === 'move')).toHaveLength(85);
  }, 60_000);
});
