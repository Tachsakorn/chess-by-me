import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateGameAnalysis, type GameAnalysis, type GameRecord } from '@/contract';
import { RULES_VERSION } from './classify';
import { rebuildAnalysis } from './rebuild';

const FIXTURES = ['lichess-LAGvRNey', 'lichess-HKl8S22m', 'lichess-f6WkG3uO'];

function read<T>(name: string, file: string): T {
  const url = new URL(`../../fixtures/${name}/${file}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as T;
}

/** What a 1.0.x user has saved: the same evaluations, labelled under an older rules version. */
function older(analysis: GameAnalysis): GameAnalysis {
  return {
    ...analysis,
    rulesVersion: 5,
    // Labels of older rules: wrong on purpose, so nothing of them can be reused.
    moves: analysis.moves.map((move) => ({ ...move, category: 'good', tags: [] })),
    white: { ...analysis.white, accuracy: 1 },
    black: { ...analysis.black, accuracy: 1 },
  };
}

describe('rebuildAnalysis', () => {
  for (const name of FIXTURES) {
    it(`${name}: gives the stored current-rules analysis back from the evaluations alone`, () => {
      const game = read<GameRecord>(name, 'game.json');
      const current = read<GameAnalysis>(name, 'analysis-lite.json');
      const rebuilt = rebuildAnalysis(game, older(current));
      expect(rebuilt).not.toBeNull();
      expect(validateGameAnalysis(rebuilt!, game)).toEqual([]);
      expect(rebuilt!.rulesVersion).toBe(RULES_VERSION);
      expect(rebuilt).toEqual(current);
    });
  }

  it('keeps when the analysis was made and with which engine', () => {
    const game = read<GameRecord>('lichess-LAGvRNey', 'game.json');
    const current = read<GameAnalysis>('lichess-LAGvRNey', 'analysis-lite.json');
    const rebuilt = rebuildAnalysis(game, older(current))!;
    expect(rebuilt.createdAt).toBe(current.createdAt);
    expect(rebuilt.engine).toEqual(current.engine);
  });

  it('works out the book moves played as errors again (opening.errorPlies)', () => {
    const game = read<GameRecord>('lichess-LAGvRNey', 'game.json');
    const current = read<GameAnalysis>('lichess-LAGvRNey', 'analysis-lite.json');
    const stale = older(current);
    stale.opening = stale.opening ? { ...stale.opening, errorPlies: [1] } : null;
    expect(rebuildAnalysis(game, stale)?.opening).toEqual(current.opening);
  });

  it('gives null for a review shorter than its game (B4-08): the engine has to run', () => {
    const game = read<GameRecord>('lichess-HKl8S22m', 'game.json');
    const current = read<GameAnalysis>('lichess-HKl8S22m', 'analysis-lite.json');
    const short = { ...older(current), positions: current.positions.slice(0, 20) };
    expect(rebuildAnalysis(game, short)).toBeNull();
  });

  it('gives null for an analysis of another game', () => {
    const game = read<GameRecord>('lichess-HKl8S22m', 'game.json');
    const other = read<GameAnalysis>('lichess-LAGvRNey', 'analysis-lite.json');
    expect(rebuildAnalysis(game, older(other))).toBeNull();
  });

  it('gives null when a saved position is missing or does not fit the contract', () => {
    const game = read<GameRecord>('lichess-f6WkG3uO', 'game.json');
    const current = read<GameAnalysis>('lichess-f6WkG3uO', 'analysis-lite.json');
    const holes = older(current);
    holes.positions = [...current.positions];
    (holes.positions as unknown[])[5] = null;
    expect(rebuildAnalysis(game, holes)).toBeNull();
    const broken = older(current);
    broken.positions = current.positions.map((p, i) => (i === 3 ? { ...p, whiteExpected: 7 } : p));
    expect(rebuildAnalysis(game, broken)).toBeNull();
  });
});
