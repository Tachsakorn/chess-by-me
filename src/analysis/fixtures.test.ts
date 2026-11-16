import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateGameAnalysis,
  type GameAnalysis,
  type GameRecord,
  type MoveCategory,
} from '@/contract';
import { buildAnalysis } from './buildAnalysis';

// The fixtures the screens are developed against must stay what the real code produces.
const root = fileURLToPath(new URL('../../fixtures/', import.meta.url));
const folders = readdirSync(root).filter((name) => statSync(root + name).isDirectory());
const load = (folder: string) => ({
  game: JSON.parse(readFileSync(`${root}${folder}/game.json`, 'utf8')) as GameRecord,
  analysis: JSON.parse(readFileSync(`${root}${folder}/analysis.json`, 'utf8')) as GameAnalysis,
});
const categories = (analysis: GameAnalysis) => new Set(analysis.moves.map((m) => m.category));

describe('fixtures', () => {
  it('are the three real games this file knows about', () => {
    expect(folders.sort()).toEqual(['lichess-HKl8S22m', 'lichess-LAGvRNey', 'lichess-f6WkG3uO']);
  });

  it.each(folders)('%s fits the contract and is what buildAnalysis gives today', (folder) => {
    const { game, analysis } = load(folder);
    expect(validateGameAnalysis(analysis, game)).toEqual([]);
    expect(game.pgn).toBe(readFileSync(`${root}${folder}/game.pgn`, 'utf8'));
    expect(
      buildAnalysis({
        game,
        positions: analysis.positions,
        opening: analysis.opening,
        engine: analysis.engine,
        createdAt: analysis.createdAt,
      }),
    ).toEqual(analysis);
  });

  it('cover a game lost on time, with a miss and brilliant moves', () => {
    const { game, analysis } = load('lichess-HKl8S22m');
    expect(game.termination).toBe('timeout');
    expect(game.result).toBe('0-1');
    expect(analysis.positions.at(-1)?.source).toBe('engine');
    expect(categories(analysis)).toContain<MoveCategory>('miss');
    expect(categories(analysis)).toContain<MoveCategory>('brilliant');
  });

  it('cover a game with a blunder that throws the game away and a brilliant move', () => {
    const { game, analysis } = load('lichess-f6WkG3uO');
    expect(game.termination).toBe('checkmate');
    expect(categories(analysis)).toContain<MoveCategory>('brilliant');
    const blunder = analysis.moves.find((m) => m.category === 'blunder');
    expect(blunder?.tags).toContain('throws-away-advantage');
  });

  it('between them show all ten move categories', () => {
    const seen = new Set(folders.flatMap((folder) => [...categories(load(folder).analysis)]));
    expect([...seen].sort()).toEqual(
      [
        'best',
        'blunder',
        'book',
        'brilliant',
        'excellent',
        'good',
        'great',
        'inaccuracy',
        'miss',
        'mistake',
      ].sort(),
    );
  });
});
