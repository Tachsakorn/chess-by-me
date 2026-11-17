import { describe, expect, it, vi } from 'vitest';
import type { AnalysisOptions, PositionEval } from '@/contract';
import type { AnalysisEngine } from './analyzeGame';
import { EngineError, type RawEval } from './engine';
import { createPositionEvaluator, type PositionEvaluator } from './positionEvaluator';

const options: AnalysisOptions = { engine: 'lite', depth: 18, useCloudEval: false };

// After 1. e4 (Black to move), after 1. e4 e5 (White to move) and after 1. d4 (Black to move).
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const AFTER_D4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
// Fool's mate: White is checkmated.
const MATED = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';

/** What the engine says of each position, from the side to move, as a real engine does. */
const ANSWERS: Record<string, RawEval> = {
  [AFTER_E4]: {
    depth: 18,
    lines: [
      { rank: 1, score: { kind: 'cp', value: -30 }, pv: ['e7e5', 'g1f3'] },
      { rank: 2, score: { kind: 'cp', value: -40 }, pv: ['c7c5'] },
    ],
  },
  [AFTER_E4_E5]: {
    depth: 18,
    lines: [{ rank: 1, score: { kind: 'cp', value: 25 }, pv: ['g1f3', 'b8c6'] }],
  },
  [AFTER_D4]: {
    depth: 18,
    lines: [{ rank: 1, score: { kind: 'cp', value: -20 }, pv: ['d7d5'] }],
  },
};

interface Search {
  fen: string;
  depth: number;
  signal: AbortSignal | undefined;
  answer(): void;
  fail(error: unknown): void;
}

/** An engine whose searches wait until the test answers them, and stop when aborted. */
function manualEngine() {
  const log: string[] = [];
  const searches: Search[] = [];
  const engine: AnalysisEngine = {
    start: async (startOptions) => {
      log.push(`start multiPv=${startOptions.multiPv} hash=${startOptions.hashMb}`);
    },
    newGame: () => {
      log.push('newGame');
    },
    evaluate: (fen, depth, signal) =>
      new Promise<RawEval>((resolve, reject) => {
        log.push(`evaluate ${fen}`);
        signal?.addEventListener('abort', () => reject(new EngineError('cancelled')), {
          once: true,
        });
        searches.push({
          fen,
          depth,
          signal,
          answer: () => resolve(ANSWERS[fen]!),
          fail: reject,
        });
      }),
    close: () => {
      log.push('close');
    },
  };
  return { engine, log, searches };
}

/** Lets the evaluator's promises settle. */
const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function setup() {
  const made: ReturnType<typeof manualEngine>[] = [];
  let changes = 0;
  const evaluator: PositionEvaluator = createPositionEvaluator(
    {
      createEngine: () => {
        const next = manualEngine();
        made.push(next);
        return next.engine;
      },
    },
    options,
    () => {
      changes += 1;
    },
  );
  return { evaluator, made, changes: () => changes };
}

describe('createPositionEvaluator', () => {
  it('makes no engine until a position is wanted', () => {
    const { made } = setup();
    expect(made).toHaveLength(0);
  });

  it('searches a wanted position at the given depth, from a cleared engine, on one engine', async () => {
    const { evaluator, made, changes } = setup();
    evaluator.want([AFTER_E4]);
    await settle();
    expect(made).toHaveLength(1);
    const { log, searches } = made[0]!;
    expect(log).toEqual(['start multiPv=2 hash=16', 'newGame', `evaluate ${AFTER_E4}`]);
    expect(searches[0]!.depth).toBe(18);
    expect(evaluator.get(AFTER_E4)).toBeUndefined();

    searches[0]!.answer();
    await settle();
    expect(changes()).toBe(1);
    const position = evaluator.get(AFTER_E4)!;
    // Black to move and 30 centipawns worse for Black: +30 from White's side.
    expect(position.score).toEqual({ kind: 'cp', value: 30 });
    expect(position.whiteExpected).toBeGreaterThan(0.5);
    expect(position.depth).toBe(18);
    expect(position.source).toBe('engine');
    expect(position.lines.map((line) => line.san)).toEqual([['e5', 'Nf3'], ['c5']]);
  });

  it('clears the engine before every search and keeps to the one engine', async () => {
    const { evaluator, made } = setup();
    evaluator.want([AFTER_E4]);
    await settle();
    made[0]!.searches[0]!.answer();
    await settle();
    evaluator.want([AFTER_E4, AFTER_E4_E5]);
    await settle();
    made[0]!.searches[1]!.answer();
    await settle();
    expect(made).toHaveLength(1);
    expect(made[0]!.log).toEqual([
      'start multiPv=2 hash=16',
      'newGame',
      `evaluate ${AFTER_E4}`,
      'newGame',
      `evaluate ${AFTER_E4_E5}`,
    ]);
    // White to move: the engine's +25 is already White's.
    expect(evaluator.get(AFTER_E4_E5)!.score).toEqual({ kind: 'cp', value: 25 });
  });

  it('does not search a position it already knows', async () => {
    const { evaluator, made } = setup();
    evaluator.want([AFTER_E4]);
    await settle();
    made[0]!.searches[0]!.answer();
    await settle();
    evaluator.want([]);
    evaluator.want([AFTER_E4]);
    await settle();
    expect(made[0]!.searches).toHaveLength(1);
  });

  it('does not search a position remembered from the game analysis', async () => {
    const { evaluator, made } = setup();
    const known: PositionEval = {
      ply: 7,
      fen: AFTER_E4,
      score: { kind: 'cp', value: 31 },
      whiteExpected: 0.53,
      depth: 18,
      lines: [],
      source: 'engine',
    };
    evaluator.remember([known]);
    evaluator.want([AFTER_E4]);
    await settle();
    expect(made).toHaveLength(0);
    expect(evaluator.get(AFTER_E4)).toBe(known);
  });

  it('stops the search in progress when its position is no longer wanted', async () => {
    const { evaluator, made } = setup();
    evaluator.want([AFTER_E4]);
    await settle();
    const first = made[0]!.searches[0]!;
    evaluator.want([AFTER_D4]);
    await settle();
    expect(first.signal?.aborted).toBe(true);
    expect(made[0]!.searches.map((search) => search.fen)).toEqual([AFTER_E4, AFTER_D4]);
    expect(evaluator.error()).toBeNull();

    made[0]!.searches[1]!.answer();
    await settle();
    expect(evaluator.get(AFTER_E4)).toBeUndefined();
    expect(evaluator.get(AFTER_D4)!.score).toEqual({ kind: 'cp', value: 20 });
  });

  it('keeps the search in progress when a move is added after it, and searches in order', async () => {
    const { evaluator, made } = setup();
    evaluator.want([AFTER_E4]);
    await settle();
    evaluator.want([AFTER_E4, AFTER_E4_E5]);
    await settle();
    const { searches } = made[0]!;
    expect(searches).toHaveLength(1); // one at a time
    expect(searches[0]!.signal?.aborted).toBe(false);
    searches[0]!.answer();
    await settle();
    expect(searches.map((search) => search.fen)).toEqual([AFTER_E4, AFTER_E4_E5]);
  });

  it('decides a finished position by the rules, without the engine', async () => {
    const { evaluator, made, changes } = setup();
    evaluator.want([MATED]);
    await settle();
    expect(made).toHaveLength(0);
    expect(changes()).toBe(1);
    expect(evaluator.get(MATED)).toMatchObject({
      score: { kind: 'over', winner: 'black' },
      source: 'rules',
      lines: [],
    });
  });

  it('reports an engine failure, closes the engine, and starts a new one on retry', async () => {
    const { evaluator, made, changes } = setup();
    evaluator.want([AFTER_E4]);
    await settle();
    made[0]!.searches[0]!.fail(new EngineError('engine-crashed', 'gone'));
    await settle();
    expect(evaluator.error()).toEqual({ code: 'engine-crashed', detail: 'gone' });
    expect(made[0]!.log.at(-1)).toBe('close');
    expect(changes()).toBe(1);

    evaluator.retry();
    await settle();
    expect(evaluator.error()).toBeNull();
    expect(made).toHaveLength(2);
    made[1]!.searches[0]!.answer();
    await settle();
    expect(evaluator.get(AFTER_E4)).toBeDefined();
  });

  it('fails when the engine files cannot be made ready', async () => {
    let changes = 0;
    const evaluator = createPositionEvaluator(
      {
        createEngine: () => manualEngine().engine,
        prepareEngine: async () => {
          throw new Error('HTTP 503');
        },
      },
      options,
      () => {
        changes += 1;
      },
    );
    evaluator.want([AFTER_E4]);
    await settle();
    expect(evaluator.error()).toEqual({
      code: 'engine-load-failed',
      detail: 'engine download: HTTP 503',
    });
    expect(changes).toBe(1);
  });

  it('closes its engine and reports nothing more once closed', async () => {
    const { evaluator, made, changes } = setup();
    evaluator.want([AFTER_E4]);
    await settle();
    evaluator.close();
    await settle();
    expect(made[0]!.log.at(-1)).toBe('close');
    expect(made[0]!.searches[0]!.signal?.aborted).toBe(true);
    evaluator.want([AFTER_D4]);
    await settle();
    expect(made).toHaveLength(1);
    expect(changes()).toBe(0);
  });
});

describe('the time limit of a search, by depth (1.1)', () => {
  /** An evaluator whose engine never answers; the limit is the default one for `depth`. */
  async function stuck(depth: number) {
    const { engine } = manualEngine();
    const evaluator = createPositionEvaluator(
      { createEngine: () => engine },
      { ...options, depth },
      () => {},
    );
    evaluator.want([AFTER_E4]);
    await vi.advanceTimersByTimeAsync(0);
    return evaluator;
  }

  it('gives up at 120 s at depth 18 and at 480 s at depth 22', async () => {
    vi.useFakeTimers();
    try {
      const at18 = await stuck(18);
      await vi.advanceTimersByTimeAsync(119_000);
      expect(at18.error()).toBeNull();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(at18.error()?.detail).toBe('no answer from the engine within 120000 ms');

      const at22 = await stuck(22);
      await vi.advanceTimersByTimeAsync(479_000);
      expect(at22.error()).toBeNull();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(at22.error()?.detail).toBe('no answer from the engine within 480000 ms');
    } finally {
      vi.useRealTimers();
    }
  });
});
