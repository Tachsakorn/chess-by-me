import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AnalysisEvent, GameAnalysis, GameRecord } from '@/contract';
import {
  analysisReducer,
  initialAnalysisState,
  stateFromAnalysis,
  type AnalysisState,
} from './analysisState';

const root = fileURLToPath(new URL('../../../fixtures/lichess-LAGvRNey/', import.meta.url));
const game = JSON.parse(readFileSync(`${root}game.json`, 'utf8')) as GameRecord;
const analysis = JSON.parse(readFileSync(`${root}analysis-lite.json`, 'utf8')) as GameAnalysis;
const moves = game.moves.length;

const run = (events: AnalysisEvent[], from: AnalysisState = initialAnalysisState(game)) =>
  events.reduce(analysisReducer, from);

const started: AnalysisEvent = {
  type: 'started',
  gameId: game.id,
  engine: analysis.engine,
  total: moves + 1,
};

/** The events of a real run up to and including position `last`, in the order analyzeGame sends them. */
const eventsUpTo = (last: number): AnalysisEvent[] => {
  const events: AnalysisEvent[] = [started, { type: 'opening', opening: analysis.opening }];
  for (let ply = 0; ply <= last; ply++) {
    events.push({
      type: 'position',
      position: analysis.positions[ply]!,
      done: ply + 1,
      total: moves + 1,
    });
    if (ply > 0) events.push({ type: 'move', review: analysis.moves[ply - 1]! });
  }
  return events;
};

describe('initialAnalysisState', () => {
  it('starts out preparing, with nothing known yet', () => {
    const state = initialAnalysisState(game);
    expect(state.phase).toBe('preparing');
    expect(state.reviewed).toBe(0);
    expect(state.moves).toBe(moves);
    expect(state.positions).toEqual([]);
    expect(state.reviews).toEqual([]);
    expect(state.opening).toBeUndefined();
    expect(state.white).toBeUndefined();
    expect(state.error).toBeNull();
    expect(state.depth).toBeUndefined();
  });
});

describe('the depth of the analysis', () => {
  it('is known from the start of a run, and from a finished analysis', () => {
    expect(run([started]).depth).toBe(analysis.engine.depth);
    const deeper = { ...analysis, engine: { ...analysis.engine, depth: 22 } };
    expect(stateFromAnalysis(game, deeper).depth).toBe(22);
  });
});

describe('analysisReducer', () => {
  it('stays preparing until the first position arrives', () => {
    const state = run([started, { type: 'opening', opening: analysis.opening }]);
    expect(state.phase).toBe('preparing');
    expect(state.opening).toEqual(analysis.opening);
  });

  it('ignores engine download progress: the screen shows no percentage while preparing', () => {
    const state = run([started, { type: 'engine-loading', loadedBytes: 10, totalBytes: 100 }]);
    expect(state.phase).toBe('preparing');
  });

  it('records that the game is in no opening book', () => {
    expect(run([started, { type: 'opening', opening: null }]).opening).toBeNull();
  });

  it('is analysing from the first position on, and counts the moves reviewed so far', () => {
    const state = run(eventsUpTo(16));
    expect(state.phase).toBe('analyzing');
    expect(state.reviewed).toBe(16);
    expect(state.positions[16]).toEqual(analysis.positions[16]);
    expect(state.positions[17]).toBeUndefined();
    expect(state.reviews[15]).toEqual(analysis.moves[15]);
    expect(state.reviews[16]).toBeUndefined();
  });

  it('does not change the state it was given', () => {
    const before = run(eventsUpTo(3));
    const positions = [...before.positions];
    analysisReducer(before, { type: 'move', review: analysis.moves[3]! });
    expect(before.positions).toEqual(positions);
    expect(before.reviewed).toBe(3);
  });

  it('takes the finished analysis whole when it completes', () => {
    const state = run([...eventsUpTo(5), { type: 'completed', analysis }]);
    expect(state.phase).toBe('done');
    expect(state.reviewed).toBe(moves);
    expect(state.positions).toEqual(analysis.positions);
    expect(state.reviews).toEqual(analysis.moves);
    expect(state.white).toEqual(analysis.white);
    expect(state.black).toEqual(analysis.black);
    expect(state.opening).toEqual(analysis.opening);
  });

  it('keeps what was found when the reader cancels', () => {
    const state = run([
      ...eventsUpTo(30),
      { type: 'failed', error: { code: 'cancelled', detail: null } },
    ]);
    expect(state.phase).toBe('cancelled');
    expect(state.reviewed).toBe(30);
    expect(state.positions[30]).toEqual(analysis.positions[30]);
    expect(state.white).toBeUndefined();
  });

  it('keeps what was found, and why it stopped, when the analysis fails', () => {
    const error = { code: 'engine-crashed' as const, detail: 'no answer' };
    const state = run([...eventsUpTo(12), { type: 'failed', error }]);
    expect(state.phase).toBe('failed');
    expect(state.error).toEqual(error);
    expect(state.reviewed).toBe(12);
  });

  it('can fail before the engine is ready', () => {
    const error = { code: 'engine-load-failed' as const, detail: null };
    const state = run([started, { type: 'failed', error }]);
    expect(state.phase).toBe('failed');
    expect(state.reviewed).toBe(0);
  });

  it('ignores anything that arrives after the run has ended', () => {
    const ended = run([
      ...eventsUpTo(4),
      { type: 'failed', error: { code: 'cancelled', detail: null } },
    ]);
    const late = analysisReducer(ended, {
      type: 'position',
      position: analysis.positions[5]!,
      done: 6,
      total: moves + 1,
    });
    expect(late).toBe(ended);
  });

  it('counts a move only once if its review arrives twice', () => {
    const state = run([...eventsUpTo(2), { type: 'move', review: analysis.moves[1]! }]);
    expect(state.reviewed).toBe(2);
  });
});

describe('stateFromAnalysis', () => {
  it('shows a finished analysis as done', () => {
    const state = stateFromAnalysis(game, analysis);
    expect(state.phase).toBe('done');
    expect(state.reviewed).toBe(moves);
    expect(state.white).toEqual(analysis.white);
  });
});
