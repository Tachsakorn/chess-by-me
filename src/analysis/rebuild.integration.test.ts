import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateGameAnalysis,
  type AnalysisEvent,
  type GameAnalysis,
  type GameRecord,
} from '@/contract';
import { createAnalyzeGame } from './analyzeGame';
import { loadOpeningBook } from './classify';
import { UciEngine } from './engine';
import { createNodeTransport } from './engine/testing/nodeTransport';
import { rebuildAnalysis } from './rebuild';

// 1.1.1 (Fable review 1.1 B2-01): a saved analysis of older rules is rebuilt from its own
// positions instead of running the engine again. The rebuilt result must be exactly what a fresh
// engine run at the same depth gives: labels, accuracies, summaries, opening.
const FIXTURES = ['lichess-LAGvRNey', 'lichess-HKl8S22m', 'lichess-f6WkG3uO'];
const DEPTH = 10;

function fresh(game: GameRecord): Promise<GameAnalysis> {
  const analyzeGame = createAnalyzeGame({
    createEngine: (variant) => new UciEngine(createNodeTransport(variant)),
    loadOpeningBook,
  });
  return new Promise((resolve, reject) => {
    analyzeGame(
      game,
      { engine: 'lite', depth: DEPTH, useCloudEval: false },
      (event: AnalysisEvent) => {
        if (event.type === 'completed') resolve(event.analysis);
        if (event.type === 'failed')
          reject(new Error(`${event.error.code}: ${event.error.detail}`));
      },
    );
  });
}

describe('rebuilt analysis == fresh engine analysis (real lite engine)', () => {
  for (const name of FIXTURES) {
    it(`${name} at depth ${DEPTH}`, async () => {
      const url = new URL(`../../fixtures/${name}/game.json`, import.meta.url);
      const game = JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as GameRecord;
      const engineRun = await fresh(game);
      // A 1.0.x user's copy: same evaluations, older rules, other labels and figures.
      const stored: GameAnalysis = {
        ...engineRun,
        rulesVersion: 5,
        moves: engineRun.moves.map((move) => ({ ...move, category: 'good', tags: [] })),
        white: { ...engineRun.white, accuracy: 0 },
        black: { ...engineRun.black, accuracy: 0 },
      };
      const rebuilt = rebuildAnalysis(game, stored);
      expect(rebuilt).not.toBeNull();
      expect(validateGameAnalysis(rebuilt!, game)).toEqual([]);
      expect(rebuilt!.moves).toEqual(engineRun.moves);
      expect(rebuilt!.white).toEqual(engineRun.white);
      expect(rebuilt!.black).toEqual(engineRun.black);
      expect(rebuilt!.opening).toEqual(engineRun.opening);
      expect(rebuilt).toEqual(engineRun);
    }, 120_000);
  }
});
