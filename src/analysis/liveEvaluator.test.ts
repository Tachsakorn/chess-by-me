import { describe, expect, it } from 'vitest';
import type { RawEval, SearchOptions } from './engine';
import { createLiveEvaluator, LIVE_LINES, type LiveEngine } from './liveEvaluator';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
// Fool's mate: White is mated, decided by the rules.
const MATED = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';

interface Asked {
  fen: string;
  depth: number;
  options: SearchOptions | undefined;
  signal: AbortSignal | undefined;
  progress(raw: RawEval): void;
  finish(raw: RawEval): void;
}

/** An engine whose searches the test finishes by hand. */
function manualEngine() {
  const asked: Asked[] = [];
  const started: Array<{ multiPv: number; hashMb?: number }> = [];
  let newGames = 0;
  const engine: LiveEngine = {
    start: (options) => {
      started.push(options);
      return Promise.resolve();
    },
    newGame: () => {
      newGames += 1;
    },
    evaluate: (fen, depth, signal, options) =>
      new Promise<RawEval>((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('cancelled')));
        asked.push({
          fen,
          depth,
          options,
          signal,
          progress: (raw) => options?.onProgress?.(raw),
          finish: resolve,
        });
      }),
    close: () => {},
  };
  return { engine, asked, started, newGames: () => newGames };
}

const raw = (depth: number, cp: number, move = 'e2e4'): RawEval => ({
  depth,
  lines: [{ rank: 1, score: { kind: 'cp', value: cp }, pv: [move] }],
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup() {
  const fake = manualEngine();
  let changes = 0;
  const live = createLiveEvaluator(
    { createEngine: () => fake.engine },
    { engine: 'lite', depth: 18, movetimeMs: 5000 },
    () => {
      changes += 1;
    },
  );
  return { ...fake, live, changes: () => changes };
}

describe('createLiveEvaluator', () => {
  it('starts one engine with three lines and searches the shown position to the depth or the time', async () => {
    const { live, asked, started } = setup();
    live.show(START);
    await settle();
    expect(started).toEqual([{ multiPv: LIVE_LINES, hashMb: 16 }]);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ fen: START, depth: 18, options: { movetimeMs: 5000 } });
  });

  it('shows the result so far, then the finished result', async () => {
    const { live, asked } = setup();
    live.show(START);
    await settle();
    asked[0]!.progress(raw(5, 20));
    await settle();
    expect(live.get(START)).toMatchObject({ done: false, position: { depth: 5 } });
    asked[0]!.finish(raw(18, 31));
    await settle();
    expect(live.get(START)).toMatchObject({
      done: true,
      position: { depth: 18, score: { kind: 'cp', value: 31 } },
    });
    expect(live.get(START)!.position.lines[0]!.san).toEqual(['e4']);
  });

  it('stops the search when another position is shown, and forgets what it found half way', async () => {
    const { live, asked } = setup();
    live.show(START);
    await settle();
    asked[0]!.progress(raw(5, 20));
    await settle();
    live.show(AFTER_E4);
    expect(asked[0]!.signal!.aborted).toBe(true);
    await settle();
    expect(live.get(START)).toBeUndefined();
    expect(asked[1]!.fen).toBe(AFTER_E4);
  });

  it('never searches a finished position again', async () => {
    const { live, asked } = setup();
    live.show(START);
    await settle();
    asked[0]!.finish(raw(18, 31));
    await settle();
    live.show(AFTER_E4);
    await settle();
    asked[1]!.finish(raw(18, -25, 'e7e5'));
    await settle();
    live.show(START);
    await settle();
    expect(asked).toHaveLength(2);
    expect(live.get(START)?.done).toBe(true);
  });

  it('decides a mate by the rules, without the engine', async () => {
    const { live, asked } = setup();
    live.show(MATED);
    await settle();
    expect(asked).toHaveLength(0);
    expect(live.get(MATED)).toMatchObject({
      done: true,
      position: { score: { kind: 'over', winner: 'black' } },
    });
  });

  it('reports a failure and searches again on retry', async () => {
    const fake = manualEngine();
    let fail = true;
    const engine: LiveEngine = {
      ...fake.engine,
      evaluate: (...args) =>
        fail ? Promise.reject(new Error('worker died')) : fake.engine.evaluate(...args),
    };
    const live = createLiveEvaluator(
      { createEngine: () => engine },
      { engine: 'lite', depth: 18, movetimeMs: 5000 },
      () => {},
    );
    live.show(START);
    await settle();
    await settle();
    expect(live.error()?.code).toBe('engine-crashed');
    fail = false;
    live.retry();
    await settle();
    expect(fake.asked).toHaveLength(1);
    expect(live.error()).toBeNull();
  });

  it('stops everything on close', async () => {
    const { live, asked, changes } = setup();
    live.show(START);
    await settle();
    live.close();
    expect(asked[0]!.signal!.aborted).toBe(true);
    const before = changes();
    asked[0]!.progress(raw(5, 20));
    await settle();
    expect(changes()).toBe(before);
    live.show(AFTER_E4);
    await settle();
    expect(asked).toHaveLength(1);
  });
});
