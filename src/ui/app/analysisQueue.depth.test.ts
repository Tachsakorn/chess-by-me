import { describe, expect, it, vi } from 'vitest';
import type { AnalysisEvent, AnalysisOptions, GameRecord } from '@/contract';

/** Each run the queue starts: the game, the options it was given, and a way to end it. */
const runs: { id: string; options: AnalysisOptions; emit(event: AnalysisEvent): void }[] = [];

vi.mock('@/analysis', () => ({
  APP_ANALYSIS_OPTIONS: { engine: 'lite', depth: 18, useCloudEval: false },
  analyzeGame: (
    game: GameRecord,
    options: AnalysisOptions,
    emit: (event: AnalysisEvent) => void,
  ) => {
    runs.push({ id: game.id, options, emit });
    return { cancel: () => {} };
  },
}));

const items = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => items.get(key) ?? null,
  setItem: (key: string, value: string) => void items.set(key, value),
});

const { useAnalysisQueue } = await import('./analysisQueue');
const { saveDepth } = await import('./analysisDepth');

const game = (id: string) => ({ id, moves: [] }) as unknown as GameRecord;

describe('analysis queue and the depth picked in Settings', () => {
  it('reads the depth when each game starts: the running game keeps its own', () => {
    const queue = useAnalysisQueue.getState();
    queue.enqueue(game('first'));
    queue.enqueue(game('second'));
    expect(runs.map((run) => [run.id, run.options.depth])).toEqual([['first', 18]]);

    // Changed while "first" runs and "second" waits.
    saveDepth(22);
    expect(runs[0]!.options.depth).toBe(18);

    // "first" ends; "second" starts with the new depth.
    runs[0]!.emit({ type: 'failed', error: { code: 'engine-crashed', detail: null } });
    expect(runs.map((run) => [run.id, run.options.depth])).toEqual([
      ['first', 18],
      ['second', 22],
    ]);
    expect(runs[1]!.options).toMatchObject({ engine: 'lite', useCloudEval: false });
  });
});
