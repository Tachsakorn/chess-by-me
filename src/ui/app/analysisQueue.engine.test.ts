import { describe, expect, it, vi } from 'vitest';
import type { AnalysisEvent, GameRecord } from '@/contract';

// 1.1.1 (owner): "Downloading the engine… N%" only for a real download; an engine already on the
// device is "Loading the engine…".
const runs: { emit(event: AnalysisEvent): void }[] = [];
vi.mock('@/analysis', () => ({
  APP_ANALYSIS_OPTIONS: { engine: 'lite', depth: 18, useCloudEval: false },
  analyzeGame: (_game: GameRecord, _options: unknown, emit: (event: AnalysisEvent) => void) => {
    runs.push({ emit });
    return { cancel: () => {} };
  },
}));
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });

const { useAnalysisQueue } = await import('./analysisQueue');
const game = (id: string) => ({ id, moves: [] }) as unknown as GameRecord;

describe('analysis queue: where the engine comes from', () => {
  it('shows a percentage for a download and "device" for files already here', () => {
    useAnalysisQueue.getState().enqueue(game('g'));
    const run = runs.at(-1)!;
    run.emit({ type: 'engine-loading', loadedBytes: 30, totalBytes: 100 });
    expect(useAnalysisQueue.getState().download).toBe(30);
    run.emit({ type: 'engine-loading', loadedBytes: 30, totalBytes: 100, cached: true });
    expect(useAnalysisQueue.getState().download).toBe('device');
    run.emit({ type: 'engine-loading', loadedBytes: 100, totalBytes: null, cached: true });
    expect(useAnalysisQueue.getState().download).toBe('device');
  });
});

describe('analysis queue: stopAll (Fable review 1.1 B4-01)', () => {
  it('drops the running game and the line, and ignores what the stopped run still sends', () => {
    const queue = useAnalysisQueue.getState();
    queue.enqueue(game('x'));
    queue.enqueue(game('y'));
    const run = runs.at(-1)!;
    useAnalysisQueue.getState().stopAll();
    expect(useAnalysisQueue.getState()).toMatchObject({ running: null, waiting: [], live: {} });
    run.emit({ type: 'engine-loading', loadedBytes: 50, totalBytes: 100 });
    run.emit({ type: 'failed', error: { code: 'engine-crashed', detail: null } });
    expect(useAnalysisQueue.getState()).toMatchObject({
      running: null,
      download: null,
      failed: [],
    });
  });
});
