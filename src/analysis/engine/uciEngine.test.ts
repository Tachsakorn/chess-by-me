import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineError } from './errors';
import type { EngineTransport } from './transport';
import { UciEngine } from './uciEngine';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

/** A transport driven by the test: it records what the engine class sends and replays lines. */
class FakeTransport implements EngineTransport {
  readonly sent: string[] = [];
  closed = false;
  /** Called for every command, after it is recorded. Lets a test answer like an engine would. */
  reply: (command: string) => void = () => {};
  private readonly lineListeners: Array<(line: string) => void> = [];
  private readonly errorListeners: Array<(detail: string) => void> = [];

  send(command: string): void {
    this.sent.push(command);
    this.reply(command);
  }
  onLine(listener: (line: string) => void): void {
    this.lineListeners.push(listener);
  }
  onError(listener: (detail: string) => void): void {
    this.errorListeners.push(listener);
  }
  close(): void {
    this.closed = true;
  }
  emit(...lines: string[]): void {
    for (const line of lines) for (const listener of this.lineListeners) listener(line);
  }
  fail(detail: string): void {
    for (const listener of this.errorListeners) listener(detail);
  }
}

/** Lets promise callbacks that are already queued run. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Answers the handshake like an engine and leaves searches to the test. */
function handshake(transport: FakeTransport): void {
  transport.reply = (command) => {
    if (command === 'uci') transport.emit('id name Stockfish 17.1 Lite', 'uciok');
    if (command === 'isready') transport.emit('readyok');
  };
}

async function startedEngine(multiPv = 2) {
  const transport = new FakeTransport();
  handshake(transport);
  const engine = new UciEngine(transport);
  await engine.start({ multiPv });
  transport.sent.length = 0;
  return { transport, engine };
}

/** Resolves to the rejection of a promise, failing the test if it fulfils. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

function expectEngineError(error: unknown, code: string): EngineError {
  expect(error).toBeInstanceOf(EngineError);
  expect((error as EngineError).code).toBe(code);
  return error as EngineError;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('UciEngine.start', () => {
  // Speed round (2026-11-15): every engine of the pool gets the same, small hash.
  it('sets the hash size before isready when asked', async () => {
    const transport = new FakeTransport();
    const engine = new UciEngine(transport);
    const started = engine.start({ multiPv: 2, hashMb: 16 });
    transport.emit('uciok');
    expect(transport.sent).toEqual([
      'uci',
      'setoption name MultiPV value 2',
      'setoption name Hash value 16',
      'isready',
    ]);
    transport.emit('readyok');
    await started;
  });

  it('sends uci, waits for uciok, sets MultiPV, sends isready and resolves on readyok', async () => {
    const transport = new FakeTransport();
    const engine = new UciEngine(transport);
    let resolved = false;
    const started = engine.start({ multiPv: 2 }).then(() => {
      resolved = true;
    });

    expect(transport.sent).toEqual(['uci']);
    transport.emit('id name Stockfish 17.1 Lite', 'option name MultiPV type spin default 1');
    await tick();
    expect(transport.sent).toEqual(['uci']);

    transport.emit('uciok');
    expect(transport.sent).toEqual(['uci', 'setoption name MultiPV value 2', 'isready']);
    await tick();
    expect(resolved).toBe(false);

    transport.emit('readyok');
    await started;
    expect(resolved).toBe(true);
  });

  it('does not take a readyok that comes before uciok as the end of the handshake', async () => {
    const transport = new FakeTransport();
    const engine = new UciEngine(transport, { startTimeoutMs: 20 });
    const started = engine.start({ multiPv: 1 });
    transport.emit('readyok');
    expectEngineError(await rejection(started), 'engine-load-failed');
    expect(transport.sent).toEqual(['uci']);
  });

  it('rejects with engine-load-failed when the engine never answers uci', async () => {
    const transport = new FakeTransport();
    const engine = new UciEngine(transport, { startTimeoutMs: 20 });
    const error = expectEngineError(
      await rejection(engine.start({ multiPv: 2 })),
      'engine-load-failed',
    );
    expect(error.detail).toContain('uciok');
  });

  it('rejects with engine-load-failed when the engine answers uciok but never readyok', async () => {
    const transport = new FakeTransport();
    transport.reply = (command) => {
      if (command === 'uci') transport.emit('uciok');
    };
    const engine = new UciEngine(transport, { startTimeoutMs: 20 });
    const error = expectEngineError(
      await rejection(engine.start({ multiPv: 2 })),
      'engine-load-failed',
    );
    expect(error.detail).toContain('readyok');
  });

  it('waits 30 seconds by default before giving up', async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();
    const engine = new UciEngine(transport);
    let outcome: unknown = 'pending';
    engine.start({ multiPv: 2 }).then(
      () => {
        outcome = 'resolved';
      },
      (error: unknown) => {
        outcome = error;
      },
    );

    await vi.advanceTimersByTimeAsync(29_999);
    expect(outcome).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expectEngineError(outcome, 'engine-load-failed');
  });

  it('rejects with engine-load-failed when the transport fails while loading', async () => {
    const transport = new FakeTransport();
    const engine = new UciEngine(transport);
    const started = engine.start({ multiPv: 2 });
    transport.fail('script not found');
    const error = expectEngineError(await rejection(started), 'engine-load-failed');
    expect(error.detail).toBe('script not found');
  });

  it('keeps failing evaluate with engine-load-failed after a failed start', async () => {
    const transport = new FakeTransport();
    const engine = new UciEngine(transport, { startTimeoutMs: 20 });
    await rejection(engine.start({ multiPv: 2 }));
    transport.sent.length = 0;
    expectEngineError(await rejection(engine.evaluate(START, 10)), 'engine-load-failed');
    expect(transport.sent).toEqual([]);
  });

  it('refuses to evaluate before start', async () => {
    const transport = new FakeTransport();
    const engine = new UciEngine(transport);
    expectEngineError(await rejection(engine.evaluate(START, 10)), 'engine-load-failed');
    expect(transport.sent).toEqual([]);
  });

  it('refuses a second start and sends nothing for it', async () => {
    const { transport, engine } = await startedEngine();
    expectEngineError(await rejection(engine.start({ multiPv: 2 })), 'engine-load-failed');
    expect(transport.sent).toEqual([]);
  });

  it('rejects a multiPv that is not a positive whole number without sending anything', async () => {
    const transport = new FakeTransport();
    const engine = new UciEngine(transport);
    await expect(engine.start({ multiPv: 0 })).rejects.toBeInstanceOf(RangeError);
    await expect(engine.start({ multiPv: 1.5 })).rejects.toBeInstanceOf(RangeError);
    expect(transport.sent).toEqual([]);
  });
});

describe('UciEngine.evaluate', () => {
  it('sends the position, then go depth, and resolves on bestmove', async () => {
    const { transport, engine } = await startedEngine();
    const pending = engine.evaluate(START, 12);
    await tick();
    expect(transport.sent).toEqual([`position fen ${START}`, 'go depth 12']);

    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    transport.emit(
      'info depth 1 seldepth 2 multipv 1 score cp 17 nodes 20 pv e2e4',
      'info depth 1 seldepth 2 multipv 2 score cp 12 nodes 20 pv d2d4',
    );
    await tick();
    expect(settled).toBe(false);

    transport.emit('bestmove e2e4 ponder e7e5');
    expect(await pending).toEqual({
      depth: 1,
      lines: [
        { rank: 1, score: { kind: 'cp', value: 17 }, pv: ['e2e4'] },
        { rank: 2, score: { kind: 'cp', value: 12 }, pv: ['d2d4'] },
      ],
    });
  });

  it('returns the lines of the deepest depth, rank 1 first, whatever order they arrive in', async () => {
    const { transport, engine } = await startedEngine();
    const pending = engine.evaluate(START, 3);
    await tick();
    transport.emit(
      'info depth 2 multipv 1 score cp 30 pv e2e4 e7e5',
      'info depth 2 multipv 2 score cp 25 pv d2d4 d7d5',
      'info depth 3 multipv 2 score cp 21 pv g1f3 d7d5 d2d4',
      'info depth 3 multipv 1 score cp 28 pv d2d4 d7d5 c2c4',
      'bestmove d2d4 ponder d7d5',
    );
    expect(await pending).toEqual({
      depth: 3,
      lines: [
        { rank: 1, score: { kind: 'cp', value: 28 }, pv: ['d2d4', 'd7d5', 'c2c4'] },
        { rank: 2, score: { kind: 'cp', value: 21 }, pv: ['g1f3', 'd7d5', 'd2d4'] },
      ],
    });
  });

  it('leaves out a rank that was not reported at the deepest depth', async () => {
    const { transport, engine } = await startedEngine();
    const pending = engine.evaluate(START, 3);
    await tick();
    transport.emit(
      'info depth 2 multipv 1 score cp 30 pv e2e4',
      'info depth 2 multipv 2 score cp 25 pv d2d4',
      'info depth 3 multipv 1 score cp 28 pv e2e4 e7e5',
      'bestmove e2e4',
    );
    expect(await pending).toEqual({
      depth: 3,
      lines: [{ rank: 1, score: { kind: 'cp', value: 28 }, pv: ['e2e4', 'e7e5'] }],
    });
  });

  it('does not count a depth at which only rank 2 was reported', async () => {
    const { transport, engine } = await startedEngine();
    const pending = engine.evaluate(START, 3);
    await tick();
    transport.emit(
      'info depth 2 multipv 1 score cp 30 pv e2e4',
      'info depth 2 multipv 2 score cp 25 pv d2d4',
      'info depth 3 multipv 2 score cp 99 pv a2a3',
      'bestmove e2e4',
    );
    const result = await pending;
    expect(result.depth).toBe(2);
    expect(result.lines.map((line) => line.pv[0])).toEqual(['e2e4', 'd2d4']);
  });

  it('keeps the last report when a rank is reported twice at the same depth', async () => {
    const { transport, engine } = await startedEngine(1);
    const pending = engine.evaluate(START, 2);
    await tick();
    transport.emit(
      'info depth 2 multipv 1 score cp 30 pv e2e4',
      'info depth 2 multipv 1 score cp 34 pv d2d4',
      'bestmove d2d4',
    );
    expect(await pending).toEqual({
      depth: 2,
      lines: [{ rank: 1, score: { kind: 'cp', value: 34 }, pv: ['d2d4'] }],
    });
  });

  it('yields one line when the position has a single legal move and MultiPV is 2', async () => {
    const { transport, engine } = await startedEngine(2);
    // White's only legal move is Nf1 (checked against chess.js in the integration test).
    const pending = engine.evaluate('4k3/8/8/8/8/8/3N1PPP/4r1K1 w - - 0 1', 4);
    await tick();
    transport.emit(
      'info depth 1 seldepth 2 multipv 1 score cp -300 nodes 2 pv d2f1',
      'info depth 4 seldepth 6 multipv 1 score cp -280 nodes 90 pv d2f1 e1e2',
      'bestmove d2f1 ponder e1e2',
    );
    expect(await pending).toEqual({
      depth: 4,
      lines: [{ rank: 1, score: { kind: 'cp', value: -280 }, pv: ['d2f1', 'e1e2'] }],
    });
  });

  it('ignores info string lines and lowerbound or upperbound scores', async () => {
    const { transport, engine } = await startedEngine();
    const pending = engine.evaluate(START, 9);
    await tick();
    transport.emit(
      'info string NNUE evaluation using nn-37f18f62d772.nnue (6MiB, (22528, 128, 15, 32, 1))',
      'info depth 8 multipv 1 score cp 31 pv e2e4',
      'info depth 8 multipv 2 score cp 27 pv d2d4',
      'info depth 9 multipv 1 score cp 60 lowerbound pv g1f3',
      'info depth 9 multipv 1 score cp 10 upperbound pv g1f3',
      'info string depth 9 multipv 1 score cp 500 pv a2a4',
      'info depth 9 currmove e2e4 currmovenumber 1',
      'bestmove e2e4',
    );
    expect(await pending).toEqual({
      depth: 8,
      lines: [
        { rank: 1, score: { kind: 'cp', value: 31 }, pv: ['e2e4'] },
        { rank: 2, score: { kind: 'cp', value: 27 }, pv: ['d2d4'] },
      ],
    });
  });

  it('rejects with engine-crashed when a search ends without any evaluation', async () => {
    const { transport, engine } = await startedEngine();
    const pending = engine.evaluate(START, 9);
    await tick();
    transport.emit('info depth 0 score mate 0', 'bestmove (none)');
    const error = expectEngineError(await rejection(pending), 'engine-crashed');
    expect(error.detail).toContain(START);
  });

  it('rejects a depth that is not a positive whole number without sending anything', async () => {
    const { transport, engine } = await startedEngine();
    await expect(engine.evaluate(START, 0)).rejects.toBeInstanceOf(RangeError);
    await expect(engine.evaluate(START, 2.5)).rejects.toBeInstanceOf(RangeError);
    await expect(engine.evaluate(START, Number.NaN)).rejects.toBeInstanceOf(RangeError);
    expect(transport.sent).toEqual([]);
  });

  it('runs two calls made back to back one after the other', async () => {
    const { transport, engine } = await startedEngine(1);
    const first = engine.evaluate(START, 5);
    const second = engine.evaluate(AFTER_E4, 5);
    await tick();
    expect(transport.sent).toEqual([`position fen ${START}`, 'go depth 5']);

    transport.emit('info depth 5 multipv 1 score cp 20 pv e2e4');
    await tick();
    expect(transport.sent).toHaveLength(2);

    transport.emit('bestmove e2e4');
    expect(await first).toEqual({
      depth: 5,
      lines: [{ rank: 1, score: { kind: 'cp', value: 20 }, pv: ['e2e4'] }],
    });
    await tick();
    expect(transport.sent).toEqual([
      `position fen ${START}`,
      'go depth 5',
      `position fen ${AFTER_E4}`,
      'go depth 5',
    ]);

    transport.emit('info depth 4 multipv 1 score cp -25 pv e7e5', 'bestmove e7e5');
    expect(await second).toEqual({
      depth: 4,
      lines: [{ rank: 1, score: { kind: 'cp', value: -25 }, pv: ['e7e5'] }],
    });
  });

  it('starts the next queued search even when the one before it fails', async () => {
    const { transport, engine } = await startedEngine(1);
    const first = engine.evaluate(START, 5);
    const second = engine.evaluate(AFTER_E4, 5);
    await tick();
    transport.emit('bestmove (none)');
    expectEngineError(await rejection(first), 'engine-crashed');
    await tick();
    transport.emit('info depth 5 multipv 1 score cp -25 pv e7e5', 'bestmove e7e5');
    expect((await second).depth).toBe(5);
  });
});

describe('UciEngine.evaluate, cancelling', () => {
  it('sends stop, rejects with cancelled once bestmove arrives, and stays usable', async () => {
    const { transport, engine } = await startedEngine(1);
    const controller = new AbortController();
    const pending = engine.evaluate(START, 30, controller.signal);
    let outcome: unknown = 'pending';
    pending.catch((error: unknown) => {
      outcome = error;
    });
    await tick();
    transport.emit('info depth 7 multipv 1 score cp 20 pv e2e4');

    controller.abort();
    expect(transport.sent).toEqual([`position fen ${START}`, 'go depth 30', 'stop']);
    await tick();
    expect(outcome).toBe('pending');

    transport.emit('info depth 8 multipv 1 score cp 22 pv e2e4', 'bestmove e2e4');
    expectEngineError(await rejection(pending), 'cancelled');

    transport.sent.length = 0;
    const next = engine.evaluate(AFTER_E4, 6);
    await tick();
    expect(transport.sent).toEqual([`position fen ${AFTER_E4}`, 'go depth 6']);
    transport.emit('info depth 6 multipv 1 score cp -30 pv e7e5', 'bestmove e7e5');
    expect(await next).toEqual({
      depth: 6,
      lines: [{ rank: 1, score: { kind: 'cp', value: -30 }, pv: ['e7e5'] }],
    });
  });

  it('does not start the next search until the stopped one has answered bestmove', async () => {
    const { transport, engine } = await startedEngine(1);
    const controller = new AbortController();
    const first = engine.evaluate(START, 30, controller.signal);
    const second = engine.evaluate(AFTER_E4, 6);
    first.catch(() => {});
    await tick();
    controller.abort();
    await tick();
    expect(transport.sent).toEqual([`position fen ${START}`, 'go depth 30', 'stop']);

    transport.emit('bestmove e2e4');
    await tick();
    expect(transport.sent.slice(3)).toEqual([`position fen ${AFTER_E4}`, 'go depth 6']);
    transport.emit('info depth 6 multipv 1 score cp -30 pv e7e5', 'bestmove e7e5');
    expect((await second).lines[0]?.pv).toEqual(['e7e5']);
  });

  it('rejects with cancelled and sends nothing when the signal is already aborted', async () => {
    const { transport, engine } = await startedEngine();
    const controller = new AbortController();
    controller.abort();
    expectEngineError(await rejection(engine.evaluate(START, 10, controller.signal)), 'cancelled');
    expect(transport.sent).toEqual([]);
  });

  it('does not send stop when the signal aborts after the search has finished', async () => {
    const { transport, engine } = await startedEngine(1);
    const controller = new AbortController();
    const pending = engine.evaluate(START, 5, controller.signal);
    await tick();
    transport.emit('info depth 5 multipv 1 score cp 20 pv e2e4', 'bestmove e2e4');
    await pending;
    controller.abort();
    expect(transport.sent).toEqual([`position fen ${START}`, 'go depth 5']);
  });
});

describe('UciEngine, failures and shutdown', () => {
  it('rejects with engine-crashed when the transport fails during a search', async () => {
    const { transport, engine } = await startedEngine();
    const pending = engine.evaluate(START, 12);
    await tick();
    transport.emit('info depth 3 multipv 1 score cp 20 pv e2e4');
    transport.fail('RuntimeError: unreachable');
    const error = expectEngineError(await rejection(pending), 'engine-crashed');
    expect(error.detail).toBe('RuntimeError: unreachable');
  });

  it('rejects every later evaluate with engine-crashed once the transport has failed', async () => {
    const { transport, engine } = await startedEngine();
    transport.fail('worker gone');
    transport.sent.length = 0;
    const error = expectEngineError(await rejection(engine.evaluate(START, 12)), 'engine-crashed');
    expect(error.detail).toBe('worker gone');
    expect(transport.sent).toEqual([]);
  });

  it('reports cancelled, not a crash, when the engine dies after the caller aborted', async () => {
    const { transport, engine } = await startedEngine();
    const controller = new AbortController();
    const pending = engine.evaluate(START, 12, controller.signal);
    await tick();
    controller.abort();
    transport.fail('worker gone');
    expectEngineError(await rejection(pending), 'cancelled');
    expectEngineError(await rejection(engine.evaluate(START, 12)), 'engine-crashed');
  });

  it('newGame sends ucinewgame and waits for readyok before the next search', async () => {
    const { transport, engine } = await startedEngine(1);
    transport.reply = () => {};
    engine.newGame();
    const pending = engine.evaluate(START, 5);
    await tick();
    expect(transport.sent).toEqual(['ucinewgame', 'isready']);

    transport.emit('readyok');
    await tick();
    expect(transport.sent).toEqual([
      'ucinewgame',
      'isready',
      `position fen ${START}`,
      'go depth 5',
    ]);
    transport.emit('info depth 5 multipv 1 score cp 20 pv e2e4', 'bestmove e2e4');
    expect((await pending).depth).toBe(5);
  });

  it('newGame waits for a running search to finish', async () => {
    const { transport, engine } = await startedEngine(1);
    const pending = engine.evaluate(START, 5);
    await tick();
    engine.newGame();
    await tick();
    expect(transport.sent).toEqual([`position fen ${START}`, 'go depth 5']);
    transport.emit('info depth 5 multipv 1 score cp 20 pv e2e4', 'bestmove e2e4');
    await pending;
    await tick();
    expect(transport.sent.slice(2)).toEqual(['ucinewgame', 'isready']);
  });

  it('close shuts the transport and rejects a pending search with cancelled', async () => {
    const { transport, engine } = await startedEngine();
    const pending = engine.evaluate(START, 12);
    await tick();
    engine.close();
    expect(transport.closed).toBe(true);
    expectEngineError(await rejection(pending), 'cancelled');
    transport.sent.length = 0;
    expectEngineError(await rejection(engine.evaluate(START, 12)), 'cancelled');
    expect(transport.sent).toEqual([]);
  });

  it('close during start rejects start with cancelled and cancels its timer', async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();
    const engine = new UciEngine(transport);
    const started = engine.start({ multiPv: 2 });
    engine.close();
    expectEngineError(await rejection(started), 'cancelled');
    expect(vi.getTimerCount()).toBe(0);
  });
});

// 1.1.1 (Fable review 1.1 B2-03): Stockfish answers `isready` in the middle of a search (checked
// in Edge's and WebKit's workers: 15-40 ms), so "is it alive?" can be asked at any time.
describe('UciEngine.ping', () => {
  it('is true when the engine answers readyok, also in the middle of a search', async () => {
    const { transport, engine } = await startedEngine();
    void engine.evaluate('8/8/8/8/8/8/8/K6k w - - 0 1', 20);
    await tick();
    const alive = engine.ping(1_000);
    expect(transport.sent.at(-1)).toBe('isready');
    transport.emit('readyok');
    expect(await alive).toBe(true);
  });

  it('is false when the engine stays silent for the time given', async () => {
    vi.useFakeTimers();
    try {
      const { transport, engine } = await startedEngine();
      transport.reply = () => {};
      const alive = engine.ping(5_000);
      await vi.advanceTimersByTimeAsync(4_999);
      let answered: boolean | null = null;
      void alive.then((value) => (answered = value));
      await vi.advanceTimersByTimeAsync(0);
      expect(answered).toBeNull();
      await vi.advanceTimersByTimeAsync(2);
      expect(await alive).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is false at once for an engine that failed or was closed', async () => {
    const { engine, transport } = await startedEngine();
    transport.fail('worker died');
    expect(await engine.ping(5_000)).toBe(false);
    const other = await startedEngine();
    other.engine.close();
    expect(await other.engine.ping(5_000)).toBe(false);
  });

  it('does not disturb the search it was asked during', async () => {
    const { transport, engine } = await startedEngine();
    const search = engine.evaluate('8/8/8/8/8/8/8/K6k w - - 0 1', 1);
    await tick();
    const alive = engine.ping(1_000);
    transport.emit('readyok', 'info depth 1 multipv 1 score cp 0 pv a1a2', 'bestmove a1a2');
    expect(await alive).toBe(true);
    expect((await search).depth).toBe(1);
  });
});

describe('UciEngine.evaluate, time limit and progress (analysis board)', () => {
  it('sends the plain go command when no options are given', async () => {
    const { transport, engine } = await startedEngine();
    const search = engine.evaluate(START, 18);
    await tick();
    expect(transport.sent).toEqual([`position fen ${START}`, 'go depth 18']);
    transport.emit('info depth 1 multipv 1 score cp 10 pv e2e4', 'bestmove e2e4');
    await search;
  });

  it('adds movetime to the go command', async () => {
    const { transport, engine } = await startedEngine();
    const search = engine.evaluate(START, 18, undefined, { movetimeMs: 5000 });
    await tick();
    expect(transport.sent).toEqual([`position fen ${START}`, 'go depth 18 movetime 5000']);
    transport.emit('info depth 1 multipv 1 score cp 10 pv e2e4', 'bestmove e2e4');
    await search;
  });

  it('rejects a movetime that is not a positive whole number', async () => {
    const { engine } = await startedEngine();
    await expect(engine.evaluate(START, 18, undefined, { movetimeMs: 0 })).rejects.toThrow(
      RangeError,
    );
  });

  it('reports each depth once it is complete, every line of it, and resolves the deepest', async () => {
    const { transport, engine } = await startedEngine(2);
    const seen: unknown[] = [];
    const search = engine.evaluate(START, 18, undefined, {
      movetimeMs: 1000,
      onProgress: (soFar) => seen.push(soFar),
    });
    await tick();
    transport.emit(
      'info depth 1 multipv 1 score cp 17 pv e2e4',
      'info depth 1 multipv 2 score cp 12 pv d2d4',
      'info depth 2 multipv 1 score cp 30 pv e2e4 e7e5',
    );
    expect(seen).toEqual([
      {
        depth: 1,
        lines: [
          { rank: 1, score: { kind: 'cp', value: 17 }, pv: ['e2e4'] },
          { rank: 2, score: { kind: 'cp', value: 12 }, pv: ['d2d4'] },
        ],
      },
    ]);
    // The time runs out in the middle of depth 2: the final result is what depth 2 has.
    transport.emit('bestmove e2e4');
    expect(await search).toEqual({
      depth: 2,
      lines: [{ rank: 1, score: { kind: 'cp', value: 30 }, pv: ['e2e4', 'e7e5'] }],
    });
    expect(seen).toHaveLength(1);
  });
});
