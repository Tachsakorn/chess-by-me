import { describe, expect, it, vi } from 'vitest';
import type { GameRecord } from '@/contract';

// An engine that never finishes: the games stay in the queue while the test looks.
vi.mock('@/analysis', () => ({
  APP_ANALYSIS_OPTIONS: {},
  analyzeGame: () => ({ cancel: () => {} }),
}));

const { useAnalysisQueue } = await import('./analysisQueue');
const { queuedGames } = await import('./queuedGames');

const game = (id: string) => ({ id, moves: [] }) as unknown as GameRecord;

describe('analysis queue and the games kept from trimming', () => {
  it('reports the running game and the waiting ones as they change', () => {
    const queue = useAnalysisQueue.getState();
    queue.enqueue(game('a'));
    queue.enqueue(game('b'));
    expect(useAnalysisQueue.getState().running).toBe('a');
    expect([...queuedGames()].sort()).toEqual(['a', 'b']);

    // Opening another game puts it first; the stopped one goes back in line, nothing drops out.
    useAnalysisQueue.getState().enqueue(game('c'), { first: true });
    expect([...queuedGames()].sort()).toEqual(['a', 'b', 'c']);
  });
});
