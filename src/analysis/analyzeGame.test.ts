import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  validateGameAnalysis,
  type AnalysisEvent,
  type AnalysisOptions,
  type GameAnalysis,
  type GameRecord,
  type PositionEval,
  type Score,
} from '@/contract';
import { createAnalyzeGame, type AnalysisEngine, type AnalyzeGameDeps } from './analyzeGame';
import { buildAnalysis } from './buildAnalysis';
import { loadOpeningBook } from './classify';
import { gameFrom } from './classify/testSupport';
import { EngineError, type RawEval, type UciScore } from './engine';

const readJson = <T>(name: string): T =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../fixtures/lichess-LAGvRNey/${name}`, import.meta.url)),
      'utf8',
    ),
  ) as T;

// A real game with real engine evaluations (Stockfish 17.1, depth 18).
export const game = readJson<GameRecord>('game.json');
export const recorded = readJson<GameAnalysis>('analysis.json');

/** The engine's own report (side to move's point of view) rebuilt from a recorded position. */
function rawEvalOf(position: PositionEval): RawEval {
  const whiteToMove = position.fen.split(' ')[1] === 'w';
  const toUci = (score: Score): UciScore => {
    if (score.kind === 'cp') return { kind: 'cp', value: whiteToMove ? score.value : -score.value };
    if (score.kind === 'mate') {
      const moverWins = (score.winner === 'white') === whiteToMove;
      return { kind: 'mate', value: moverWins ? score.moves : -score.moves };
    }
    throw new Error('a finished position is never searched');
  };
  return {
    depth: position.depth,
    lines: position.lines.map((line) => ({
      rank: line.rank,
      score: toUci(line.score),
      pv: line.uci,
    })),
  };
}

export interface FakeEngine extends AnalysisEngine {
  log: string[];
  searched: string[];
}

/** An engine that answers from the recorded evaluations. `evaluate` can be replaced per test. */
export function fakeEngine(overrides: Partial<AnalysisEngine> = {}): FakeEngine {
  const byFen = new Map(recorded.positions.map((p) => [p.fen, p]));
  const log: string[] = [];
  const searched: string[] = [];
  return {
    log,
    searched,
    start: async (options) => {
      log.push(`start multiPv=${options.multiPv}`);
    },
    newGame: () => {
      log.push('newGame');
    },
    evaluate: async (fen, depth) => {
      searched.push(fen);
      log.push(`evaluate depth=${depth}`);
      const position = byFen.get(fen);
      if (!position) throw new Error(`no recorded evaluation for ${fen}`);
      return rawEvalOf(position);
    },
    close: () => {
      log.push('close');
    },
    ...overrides,
  };
}

export const options: AnalysisOptions = { engine: 'full', depth: 18, useCloudEval: false };

export interface Run {
  events: AnalysisEvent[];
  cancel(): void;
  /** Resolves once `completed` or `failed` has arrived. */
  done: Promise<AnalysisEvent[]>;
}

export function run(
  deps: Partial<AnalyzeGameDeps> & { engine?: AnalysisEngine },
  runOptions: AnalysisOptions = options,
  runGame: GameRecord = game,
  onEvent: (event: AnalysisEvent, self: Run) => void = () => {},
): Run {
  const engine = deps.engine ?? fakeEngine();
  const events: AnalysisEvent[] = [];
  let finish: (events: AnalysisEvent[]) => void = () => {};
  const self: Run = {
    events,
    cancel: () => {},
    done: new Promise((resolve) => {
      finish = resolve;
    }),
  };
  const handle = createAnalyzeGame({
    createEngine: () => engine,
    loadOpeningBook,
    now: () => new Date('2026-11-13T12:00:00Z'),
    ...deps,
  })(runGame, runOptions, (event) => {
    events.push(event);
    onEvent(event, self);
    if (event.type === 'completed' || event.type === 'failed') finish(events);
  });
  self.cancel = () => handle.cancel();
  return self;
}

describe('analyzeGame on a real game with recorded evaluations', () => {
  it('emits nothing before it has returned its handle', () => {
    const r = run({});
    expect(r.events).toEqual([]);
    return r.done;
  });

  it('emits started, the opening, then a position and a move per ply, then completed', async () => {
    const events = await run({}).done;
    const types = events.map((e) => e.type);
    expect(types.slice(0, 3)).toEqual(['started', 'opening', 'position']);
    expect(types.at(-1)).toBe('completed');
    expect(types.filter((t) => t === 'opening')).toHaveLength(1);
    expect(types.filter((t) => t === 'position')).toHaveLength(86);
    expect(types.filter((t) => t === 'move')).toHaveLength(85);
    expect(types).not.toContain('failed');
    // After the first position, they alternate: position N, then the review of move N.
    expect(types.slice(3, -1)).toEqual(
      Array.from({ length: 85 }, () => ['position', 'move']).flat(),
    );
  });

  it('reports the game, the engine and real progress', async () => {
    const events = await run({}).done;
    expect(events[0]).toEqual({
      type: 'started',
      gameId: game.id,
      engine: { name: 'Stockfish', version: '17.1', variant: 'full', depth: 18, multiPv: 2 },
      total: 86,
    });
    const positions = events.filter((e) => e.type === 'position');
    expect(positions.map((e) => e.done)).toEqual(Array.from({ length: 86 }, (_, i) => i + 1));
    expect(positions.every((e) => e.total === 86)).toBe(true);
    expect(positions.map((e) => e.position.ply)).toEqual(Array.from({ length: 86 }, (_, i) => i));
  });

  it('finds the opening from the positions of the game', async () => {
    const events = await run({}).done;
    const opening = events.find((e) => e.type === 'opening');
    expect(opening).toMatchObject({ opening: { eco: 'C56', lastBookPly: 10 } });
  });

  it('completes with a valid analysis equal to buildAnalysis on the same positions', async () => {
    const events = await run({}).done;
    const completed = events.at(-1);
    if (completed?.type !== 'completed') throw new Error('expected completed');
    const { analysis } = completed;
    expect(validateGameAnalysis(analysis, game)).toEqual([]);
    // The recorded file keeps expected points to four decimals; everything else is identical.
    const withoutExpected = (positions: readonly PositionEval[]) =>
      positions.map((p) => ({ ...p, whiteExpected: 0 }));
    expect(withoutExpected(analysis.positions)).toEqual(withoutExpected(recorded.positions));
    analysis.positions.forEach((p, i) => {
      expect(p.whiteExpected).toBeCloseTo(recorded.positions[i]!.whiteExpected, 3);
    });
    expect(analysis.createdAt).toBe('2026-11-13T12:00:00.000Z');
    expect(analysis).toEqual(
      buildAnalysis({
        game,
        positions: analysis.positions,
        opening: analysis.opening,
        engine: analysis.engine,
        createdAt: analysis.createdAt,
      }),
    );
  });

  it('streams exactly the move reviews the finished analysis holds', async () => {
    const events = await run({}).done;
    const completed = events.at(-1);
    if (completed?.type !== 'completed') throw new Error('expected completed');
    const streamed = events.filter((e) => e.type === 'move').map((e) => e.review);
    expect(streamed).toEqual(completed.analysis.moves);
  });

  it('starts the engine with two lines, clears it before every search, searches in order and closes it', async () => {
    const engine = fakeEngine();
    await run({ engine }, { ...options, engine: 'lite', depth: 12 }).done;
    expect(engine.log.slice(0, 3)).toEqual(['start multiPv=2', 'newGame', 'evaluate depth=12']);
    const searches = engine.log.filter((l) => l.startsWith('evaluate')).length;
    expect(engine.log.filter((l) => l === 'newGame')).toHaveLength(searches);
    expect(engine.log.at(-1)).toBe('close');
    expect(engine.log.filter((l) => l === 'close')).toHaveLength(1);
    // The final position is checkmate: decided by the rules, never searched.
    expect(engine.searched).toEqual(recorded.positions.slice(0, 85).map((p) => p.fen));
  });

  it('asks for the engine variant that was requested', async () => {
    const asked: string[] = [];
    const engine = fakeEngine();
    await run(
      {
        createEngine: (variant) => {
          asked.push(variant);
          return engine;
        },
      },
      { ...options, engine: 'lite' },
    ).done;
    expect(asked).toEqual(['lite']);
  });
});

describe('analyzeGame and cloud eval', () => {
  const never = (async () => {
    throw new Error('fetch must not be called');
  }) as typeof fetch;

  it('does not touch the network when cloud eval is off', async () => {
    const events = await run({ fetch: never }, { ...options, useCloudEval: false }).done;
    expect(events.at(-1)?.type).toBe('completed');
  });

  it('asks Lichess cloud eval first when it is on, and searches locally on a miss', async () => {
    const urls: string[] = [];
    const notFound = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response('{"error":"Not found"}', { status: 404 });
    }) as typeof fetch;
    const engine = fakeEngine();
    const events = await run({ engine, fetch: notFound }, { ...options, useCloudEval: true }).done;
    expect(events.at(-1)?.type).toBe('completed');
    // Two misses in a row and the cloud is left alone for the rest of the game.
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('https://lichess.org/api/cloud-eval?fen=');
    expect(urls[0]).toContain('multiPv=2');
    expect(engine.searched).toHaveLength(85);
  });
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const closes = (engine: FakeEngine) => engine.log.filter((l) => l === 'close').length;

describe('analyzeGame, cancelling', () => {
  it('cancelled at once: a single failed event, and no engine is ever started', async () => {
    const engine = fakeEngine();
    const r = run({ engine });
    r.cancel();
    await r.done;
    await settle();
    expect(r.events).toEqual([{ type: 'failed', error: { code: 'cancelled', detail: null } }]);
    expect(engine.log.filter((l) => l !== 'close')).toEqual([]);
  });

  it('cancelled mid-game: one failed event, nothing after it, and the engine is closed', async () => {
    const engine = fakeEngine();
    const r = run({ engine }, options, game, (event, self) => {
      if (event.type === 'position' && event.done === 40) self.cancel();
    });
    await r.done;
    await settle();
    const types = r.events.map((e) => e.type);
    expect(types.at(-1)).toBe('failed');
    expect(r.events.at(-1)).toEqual({
      type: 'failed',
      error: { code: 'cancelled', detail: null },
    });
    expect(types.filter((t) => t === 'failed')).toHaveLength(1);
    expect(types).not.toContain('completed');
    expect(types.filter((t) => t === 'position')).toHaveLength(40);
    expect(closes(engine)).toBe(1);
    expect(engine.searched.length).toBeLessThan(45);
  });

  it('cancel after the analysis has completed does nothing', async () => {
    const engine = fakeEngine();
    const r = run({ engine });
    await r.done;
    const before = r.events.length;
    r.cancel();
    r.cancel();
    await settle();
    expect(r.events).toHaveLength(before);
    expect(r.events.at(-1)?.type).toBe('completed');
    expect(closes(engine)).toBe(1);
  });
});

describe('analyzeGame, failures', () => {
  const failure = (events: AnalysisEvent[]) => {
    const last = events.at(-1);
    if (last?.type !== 'failed') throw new Error(`expected failed, got ${last?.type}`);
    expect(events.filter((e) => e.type === 'failed')).toHaveLength(1);
    expect(events.map((e) => e.type)).not.toContain('completed');
    return last.error;
  };

  it('fails with engine-crashed instead of hanging when the engine goes silent', async () => {
    const base = fakeEngine();
    let calls = 0;
    const engine = fakeEngine({
      evaluate: (fen, depth, signal) =>
        ++calls === 5 ? new Promise<RawEval>(() => {}) : base.evaluate(fen, depth, signal),
    });
    const events = await run({ engine, searchTimeoutMs: 20 }).done;
    const error = failure(events);
    expect(error.code).toBe('engine-crashed');
    expect(error.detail).toContain('20 ms');
    expect(events.filter((e) => e.type === 'position')).toHaveLength(4);
    expect(closes(engine)).toBe(1);
  });

  it('passes on the code of an engine that cannot load', async () => {
    const engine = fakeEngine({
      start: async () => {
        throw new EngineError('engine-load-failed', 'no uciok');
      },
    });
    const events = await run({ engine }).done;
    expect(failure(events)).toEqual({ code: 'engine-load-failed', detail: 'no uciok' });
    expect(closes(engine)).toBe(1);
  });

  it('passes on an engine crash in the middle of the game', async () => {
    const base = fakeEngine();
    let calls = 0;
    const engine = fakeEngine({
      evaluate: async (fen, depth, signal) => {
        if (++calls === 10) throw new EngineError('engine-crashed', 'worker died');
        return base.evaluate(fen, depth, signal);
      },
    });
    const events = await run({ engine }).done;
    expect(failure(events)).toEqual({ code: 'engine-crashed', detail: 'worker died' });
    expect(events.filter((e) => e.type === 'position')).toHaveLength(9);
    expect(closes(engine)).toBe(1);
  });

  it('reports an unexpected error as engine-crashed with its message', async () => {
    const engine = fakeEngine({
      evaluate: async () => {
        throw new Error('something else');
      },
    });
    const events = await run({ engine }).done;
    expect(failure(events)).toEqual({ code: 'engine-crashed', detail: 'something else' });
  });

  it('refuses a game without moves or from another starting position, without an engine', async () => {
    const custom = '4k3/8/8/8/8/8/8/4K2R w K - 0 1';
    for (const unsupported of [
      { ...game, moves: [] },
      { ...game, initialFen: custom },
    ]) {
      let created = 0;
      const engine = fakeEngine();
      const events = await run(
        {
          createEngine: () => {
            created += 1;
            return engine;
          },
        },
        options,
        unsupported,
      ).done;
      expect(events).toHaveLength(1);
      expect(failure(events).code).toBe('unsupported-game');
      expect(created).toBe(0);
    }
  });
});

describe('analyzeGame, games and surroundings that are less than ideal', () => {
  const completed = (events: AnalysisEvent[]) => {
    const last = events.at(-1);
    if (last?.type !== 'completed') throw new Error(`expected completed, got ${last?.type}`);
    return last.analysis;
  };

  // Fable review A1-03: without the book the moves lose their Book label, and the result was
  // kept for good. A book that cannot be loaded now fails the run, which the user can retry.
  it('fails, and keeps nothing, when the opening book cannot be loaded', async () => {
    const events = await run({
      loadOpeningBook: async () => {
        throw new Error('chunk failed to load');
      },
    }).done;
    expect(events.some((e) => e.type === 'completed' || e.type === 'move')).toBe(false);
    expect(events.at(-1)).toEqual({
      type: 'failed',
      error: { code: 'engine-load-failed', detail: 'opening book: chunk failed to load' },
    });
  });

  it('analyses a game that stops without a mate on the board (resignation, time)', async () => {
    const resigned: GameRecord = {
      ...game,
      moves: game.moves.slice(0, 60),
      termination: 'resignation',
    };
    const engine = fakeEngine();
    const analysis = completed(await run({ engine }, options, resigned).done);
    expect(validateGameAnalysis(analysis, resigned)).toEqual([]);
    expect(analysis.positions).toHaveLength(61);
    expect(analysis.positions.at(-1)?.source).toBe('engine');
    expect(engine.searched).toHaveLength(61);
  });

  it('analyses a pasted game with no time control and no ratings', async () => {
    const bare: GameRecord = {
      ...game,
      source: 'pgn',
      sourceUrl: null,
      timeControl: null,
      white: { ...game.white, rating: null },
      black: { ...game.black, rating: null },
    };
    const analysis = completed(await run({}, options, bare).done);
    expect(validateGameAnalysis(analysis, bare)).toEqual([]);
    expect(analysis.white.estimatedRating).not.toBeNull();
  });
});

// Fable review A1-02 (2026-11-15): the review streamed during the analysis must be the one the
// finished analysis keeps. It was not for a sacrifice left again: 10.O-O-O of this French
// Exchange game showed Brilliant while analysing and Best at the end.
describe('analyzeGame, streamed reviews equal the final ones', () => {
  const FRENCH = [
    'e2e4',
    'e7e6',
    'd2d4',
    'd7d5',
    'e4d5',
    'e6d5',
    'b1c3',
    'g8f6',
    'c1g5',
    'f8e7',
    'f1d3',
    'c7c6',
    'g1f3',
    'e8g8',
    'h2h4',
    'h7h6',
    'd1d2',
    'f8e8',
    'e1c1',
  ];
  const french = gameFrom(FRENCH);
  // Scores of the app's own analysis (Stockfish 17.1 lite, depth 18), White's point of view.
  const known: Record<string, { first: number; second: number; best?: string }> = {
    [french.moves[16]!.fenBefore]: { first: -25, second: -59, best: 'd1d2' },
    [french.moves[16]!.fenAfter]: { first: -19, second: -60 },
    [french.moves[18]!.fenBefore]: { first: -18, second: -64, best: 'e1c1' },
    [french.moves[18]!.fenAfter]: { first: -21, second: -60 },
  };
  /** Two lines for every position: the known scores, else level; side to move's view. */
  const engine = fakeEngine({
    evaluate: async (fen) => {
      const whiteToMove = fen.split(' ')[1] === 'w';
      const side = (white: number) => (whiteToMove ? white : -white);
      const legal = new Chess(fen).moves({ verbose: true }).map((m) => m.lan);
      const hit = known[fen];
      const first = hit?.best ?? legal.find((m) => !FRENCH.includes(m)) ?? legal[0]!;
      const second = legal.find((m) => m !== first)!;
      return {
        depth: 18,
        lines: [
          { rank: 1, score: { kind: 'cp', value: side(hit?.first ?? 0) }, pv: [first] },
          { rank: 2, score: { kind: 'cp', value: side(hit?.second ?? -40) }, pv: [second] },
        ],
      };
    },
  });

  it('gives 10.O-O-O the same label while analysing as at the end', async () => {
    const events = await run({ engine, loadOpeningBook: async () => ({}) }, options, french).done;
    const completed = events.at(-1);
    if (completed?.type !== 'completed')
      throw new Error(`expected completed, got ${completed?.type}`);
    const streamed = events.filter((e) => e.type === 'move').map((e) => e.review);
    expect(completed.analysis.moves[16]?.category).toBe('brilliant');
    expect(completed.analysis.moves[18]?.category).toBe('best');
    expect(streamed).toEqual(completed.analysis.moves);
  });
});

// Fable review A8-01: the engine is downloaded before it is started, with progress, and the
// start's time limit only counts once the download is done.
describe('analyzeGame, downloading the engine first', () => {
  it('reports the download, then starts the engine', async () => {
    const engine = fakeEngine();
    const order: string[] = [];
    const events = await run({
      engine,
      prepareEngine: async (variant, progress) => {
        order.push(`prepare ${variant}`);
        progress(0, 100);
        progress(100, 100);
        expect(engine.log).toEqual([]); // nothing started while downloading
      },
    }).done;
    expect(order).toEqual(['prepare full']);
    expect(events.filter((e) => e.type === 'engine-loading')).toEqual([
      { type: 'engine-loading', loadedBytes: 0, totalBytes: 100 },
      { type: 'engine-loading', loadedBytes: 100, totalBytes: 100 },
    ]);
    expect(events.at(-1)?.type).toBe('completed');
  });

  it('fails with engine-load-failed when the download fails', async () => {
    const events = await run({
      prepareEngine: async () => {
        throw new Error('HTTP 503');
      },
    }).done;
    expect(events.at(-1)).toEqual({
      type: 'failed',
      error: { code: 'engine-load-failed', detail: 'engine download: HTTP 503' },
    });
  });
});

// Fable review A8-02: a phone that puts the page in the background stops the engine too. When
// the page comes back, the time limit of the search in progress starts again.
describe('analyzeGame, coming back from the background', () => {
  it('gives a search its full time again when the page is shown again', async () => {
    const base = fakeEngine();
    let resume: () => void = () => {};
    let calls = 0;
    const engine = fakeEngine({
      evaluate: (fen, depth, signal) =>
        ++calls === 3
          ? new Promise<RawEval>((resolve, reject) => {
              // The page comes back at 30 ms; the answer arrives at 60 ms (limit 50 ms).
              setTimeout(() => resume(), 30);
              setTimeout(() => base.evaluate(fen, depth, signal).then(resolve, reject), 60);
            })
          : base.evaluate(fen, depth, signal),
    });
    const events = await run({
      engine,
      searchTimeoutMs: 50,
      onResume: (listener) => {
        resume = listener;
        return () => {};
      },
    }).done;
    expect(events.at(-1)?.type).toBe('completed');
  });
});

// Speed round (owner, 2026-11-15, choice "ก"): every position is searched from a cleared engine,
// so several engines give exactly what one engine gives.
describe('analyzeGame with several engines', () => {
  const pool = (count: number) => {
    const engines: FakeEngine[] = [];
    return {
      engines,
      deps: {
        engines: count,
        createEngine: () => {
          const engine = fakeEngine({
            start: async (o) => {
              engine.log.push(`start multiPv=${o.multiPv} hash=${o.hashMb}`);
            },
          });
          engines.push(engine);
          return engine;
        },
      },
    };
  };

  it('opens the engines asked for, each with the same small hash', async () => {
    const { engines, deps } = pool(3);
    await run(deps).done;
    expect(engines).toHaveLength(3);
    for (const engine of engines) expect(engine.log[0]).toBe('start multiPv=2 hash=16');
  });

  it('clears an engine before every position it searches', async () => {
    const { engines, deps } = pool(2);
    await run(deps).done;
    for (const engine of engines) {
      const searches = engine.log.filter((l) => l.startsWith('evaluate'));
      expect(searches.length).toBeGreaterThan(0);
      engine.log.forEach((line, index) => {
        if (line.startsWith('evaluate')) expect(engine.log[index - 1]).toBe('newGame');
      });
    }
    expect(engines.flatMap((e) => e.searched).sort()).toEqual(
      recorded.positions
        .slice(0, 85)
        .map((p) => p.fen)
        .sort(),
    );
  });

  it('gives the same analysis with one engine and with four', async () => {
    const done = async (count: number) => {
      const events = await run(pool(count).deps).done;
      const last = events.at(-1);
      if (last?.type !== 'completed') throw new Error(`expected completed, got ${last?.type}`);
      return { analysis: last.analysis, events };
    };
    const one = await done(1);
    const four = await done(4);
    expect(four.analysis).toEqual(one.analysis);
    const order = (events: AnalysisEvent[]) =>
      events.filter((e) => e.type === 'position').map((e) => e.position.ply);
    expect(order(four.events)).toEqual(order(one.events));
  });

  it('closes every engine when the run is cancelled', async () => {
    const { engines, deps } = pool(3);
    const handle = run(deps, options, game, (event, self) => {
      if (event.type === 'position' && event.done === 10) self.cancel();
    });
    await handle.done;
    expect(engines).toHaveLength(3);
    for (const engine of engines) expect(engine.log.filter((l) => l === 'close')).toHaveLength(1);
  });
});
