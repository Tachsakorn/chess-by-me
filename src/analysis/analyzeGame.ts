/**
 * The whole analysis of one game, as the contract's `AnalyzeGame`: the opening
 * is looked up, every position is evaluated (cloud first when asked, then the
 * local engine), each move is reviewed as soon as the positions on both sides
 * of it are known, and the finished `GameAnalysis` is delivered at the end.
 *
 * Everything that touches the outside world comes in through `AnalyzeGameDeps`,
 * so the same code runs in the browser (see ./browser.ts), in Node tests and in
 * the fixture builder.
 *
 * Every position is searched from a cleared engine (`ucinewgame` before each search), by up to
 * `deps.engines` engines at once; the result is the same whatever their number.
 *
 * Events: `started`, `opening` (once), then for each position a `position` and,
 * from the first move on, the `move` review it completes; finally exactly one
 * of `completed` or `failed`, and nothing after it. `engine-loading` comes between
 * `opening` and the first position while `prepareEngine` downloads the engine.
 */
import type {
  AnalysisError,
  AnalysisEvent,
  AnalysisOptions,
  AnalyzeGame,
  EngineInfo,
  EngineVariant,
  GameAnalysis,
  GameRecord,
  OpeningInfo,
  PositionEval,
} from '@/contract';
import { buildAnalysis, reviewMove } from './buildAnalysis';
import { expectedPoints, findOpening, moveInputAt, type OpeningBook } from './classify';
import { ENGINE_VERSION, EngineError, evaluateGame, fetchCloudEval, type RawEval } from './engine';
import { searchTimeoutMs as searchTimeoutFor } from './searchTimeout';

/** What `analyzeGame` needs from an engine; `UciEngine` fits. */
export interface AnalysisEngine {
  start(options: { multiPv: number; hashMb?: number }): Promise<void>;
  newGame(): void;
  evaluate(fen: string, depth: number, signal?: AbortSignal): Promise<RawEval>;
  close(): void;
  /**
   * Whether the engine still answers within `waitMs`, even in the middle of a search (1.1.1,
   * Fable review 1.1 B2-03). An engine without it is judged by the clock alone, as before.
   */
  ping?(waitMs: number): Promise<boolean>;
}

export interface AnalyzeGameDeps {
  /**
   * A fresh engine. `engines` of them are made for one game; all are closed when the game is
   * done, failed or cancelled.
   */
  createEngine(variant: EngineVariant): AnalysisEngine;
  /**
   * How many engines search at once, each its own position (default 1). Every position is searched
   * from a cleared engine, so the result does not depend on this number (owner, 2026-11-15,
   * speed round, choice "ก").
   */
  engines?: number;
  loadOpeningBook(): Promise<OpeningBook>;
  /** Used for Lichess cloud eval only. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  now?: () => Date;
  /**
   * A single search that takes longer than this counts as a dead engine. Default: by depth
   * (the table in `searchTimeout.ts`).
   */
  searchTimeoutMs?: number;
  /**
   * Gets the engine's files ready before `createEngine` (the browser downloads them, reporting
   * progress), so the engine's own 30-second start limit counts only once they are here
   * (Fable review A8-01). A failure fails the run with `engine-load-failed`.
   */
  prepareEngine?(
    variant: EngineVariant,
    /** `cached`: the files come from this device's storage, not the network (1.1.1). */
    progress: (loadedBytes: number, totalBytes: number | null, cached?: boolean) => void,
  ): Promise<void>;
  /**
   * Calls `listener` when the page comes back from the background; returns how to stop. A phone
   * suspends the engine with the page, so the search in progress then gets its full time again
   * (Fable review A8-02).
   */
  onResume?(listener: () => void): () => void;
}

/** Two lines per position: a Great move is recognised by how much worse the second choice is. */
export const MULTI_PV = 2;
/**
 * Hash of every engine, in MB: Stockfish's default, set explicitly so that every engine of every
 * device searches with the same table (the size can change a result). Small enough for four
 * engines on a phone.
 */
export const ENGINE_HASH_MB = 16;
const STANDARD_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function toAnalysisError(error: unknown): AnalysisError {
  if (error instanceof EngineError) return { code: error.code, detail: error.detail };
  return { code: 'engine-crashed', detail: error instanceof Error ? error.message : String(error) };
}

/** What one run shares between its steps and its `cancel`. */
interface Run {
  signal: AbortSignal;
  emit(event: AnalysisEvent): void;
  /** Hands over an engine so that `cancel` and the end of the run can close it. */
  useEngine(engine: AnalysisEngine): void;
  /** Closes every engine of the run. */
  closeEngine(): void;
}

export function createAnalyzeGame(deps: AnalyzeGameDeps): AnalyzeGame {
  /**
   * The searches of the last game that did not finish (Fable review 1.1 B2-02): a retry of the
   * same game, engine and depth starts from them instead of from zero. One game at a time, so
   * memory stays small; dropped once the game completes. Every search starts from a cleared
   * engine, so a kept result is exactly what a new search would give.
   */
  let kept: { key: string; evals: Map<string, RawEval> } | null = null;
  return (game, options, onEvent) => {
    const key = `${game.id}|${options.engine}|${options.depth}`;
    if (kept?.key !== key) kept = { key, evals: new Map() };
    const evals = kept.evals;
    const controller = new AbortController();
    let finished = false;
    let engines: AnalysisEngine[] = [];

    const run: Run = {
      signal: controller.signal,
      emit(event) {
        if (finished) return;
        if (event.type === 'completed' || event.type === 'failed') finished = true;
        // Completed: nothing to keep for a retry. Dropped before anyone hears of it, so a run
        // started on this event begins from nothing.
        if (event.type === 'completed' && kept?.key === key) kept = null;
        onEvent(event);
      },
      useEngine(created) {
        engines.push(created);
      },
      closeEngine() {
        const open = engines;
        engines = [];
        for (const engine of open) engine.close();
      },
    };

    // The engines are closed before the last event, so a listener that starts the
    // next game on `completed` or `failed` never has two games' engines alive.
    analyze(deps, game, options, run, evals)
      .catch((error: unknown) => {
        run.closeEngine();
        run.emit({ type: 'failed', error: toAnalysisError(error) });
      })
      .finally(() => run.closeEngine());

    return {
      cancel() {
        if (finished) return;
        controller.abort();
        run.closeEngine();
        run.emit({ type: 'failed', error: { code: 'cancelled', detail: null } });
      },
    };
  };
}

/** The beat of the heartbeat, and the gap between beats that means the page was asleep. */
const HEARTBEAT_MS = 1_000;
const HEARTBEAT_GAP_MS = 5_000;
/** How often a searching engine is asked whether it is alive, and how long it has to answer. */
const LIVENESS_EVERY_MS = 10_000;
const PING_WAIT_MS = 5_000;
/** How many times a time limit is started again for an engine that still answers. */
const MAX_EXTENSIONS = 3;

async function analyze(
  deps: AnalyzeGameDeps,
  game: GameRecord,
  options: AnalysisOptions,
  run: Run,
  /** Searches already done for this game, kept for a retry after a failure (B2-02). */
  kept: Map<string, RawEval>,
): Promise<void> {
  // Let the caller receive its handle before the first event arrives.
  await Promise.resolve();
  if (run.signal.aborted) return;

  if (game.moves.length === 0) throw new EngineError('unsupported-game', 'the game has no moves');
  if (game.initialFen !== STANDARD_START) {
    throw new EngineError('unsupported-game', 'the game does not start from the standard position');
  }

  const engineInfo: EngineInfo = {
    name: 'Stockfish',
    version: ENGINE_VERSION,
    variant: options.engine,
    depth: options.depth,
    multiPv: MULTI_PV,
  };
  run.emit({ type: 'started', gameId: game.id, engine: engineInfo, total: game.moves.length + 1 });

  // Without the book the moves would lose their Book label and the result would be kept that
  // way for good, so a book that cannot be loaded fails the run; the user can try again
  // (Fable review A1-03).
  const book = await deps.loadOpeningBook().catch((error: unknown) => {
    throw new EngineError(
      'engine-load-failed',
      `opening book: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  const opening: OpeningInfo | null = findOpening(
    book,
    game.moves.map((move) => move.fenAfter),
  );
  if (run.signal.aborted) return;
  run.emit({ type: 'opening', opening });
  const lastBookPly = opening?.lastBookPly ?? 0;

  if (deps.prepareEngine) {
    await deps
      .prepareEngine(options.engine, (loadedBytes, totalBytes, cached) => {
        if (!run.signal.aborted) {
          run.emit({
            type: 'engine-loading',
            loadedBytes,
            totalBytes,
            ...(cached ? { cached } : {}),
          });
        }
      })
      .catch((error: unknown) => {
        throw new EngineError(
          'engine-load-failed',
          `engine download: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    if (run.signal.aborted) return;
  }

  const count = Math.max(1, Math.floor(deps.engines ?? 1));
  const startEngine = async (): Promise<AnalysisEngine> => {
    const engine = deps.createEngine(options.engine);
    run.useEngine(engine);
    await engine.start({ multiPv: MULTI_PV, hashMb: ENGINE_HASH_MB });
    return engine;
  };
  const pool = await Promise.all(Array.from({ length: count }, startEngine));
  if (run.signal.aborted) return;
  const idle = [...pool];
  /** How many more engines may be started to stand in for one that stopped answering (B2-02). */
  let spare = count;

  const searchTimeoutMs = deps.searchTimeoutMs ?? searchTimeoutFor(options.depth);
  /** Restart the time limits of the searches in progress. */
  const restarts = new Set<() => void>();
  const restartAll = () => {
    for (const restart of restarts) restart();
  };
  const stopListening = deps.onResume?.(restartAll) ?? (() => {});
  // A heartbeat (1.1.1, Fable review 1.1 B2-03): a computer that sleeps with the page in front
  // sends no "visible again", but its timers stop with it. A long gap between beats means the page
  // was asleep, engines included: the searches get their full time again.
  let lastBeat = Date.now();
  const heartbeat = setInterval(() => {
    const now = Date.now();
    if (now - lastBeat > HEARTBEAT_GAP_MS) restartAll();
    lastBeat = now;
  }, HEARTBEAT_MS);
  const stopWatching = () => {
    stopListening();
    clearInterval(heartbeat);
  };
  /** True when more time passed than `expected` could explain: the page slept in between. */
  const slept = (since: number, expected: number) =>
    Date.now() - since > expected + HEARTBEAT_GAP_MS;

  /**
   * One search on `engine`, from a cleared engine (`ucinewgame` first, by the caller), so the
   * result depends on the position alone. `dead` when the engine stopped answering (B2-02: the
   * caller hands the position to another engine). An engine without `ping` is judged by the clock
   * alone, as before 1.1.1.
   */
  const searchOn = (
    engine: AnalysisEngine,
    fen: string,
    depth: number,
    signal?: AbortSignal,
  ): Promise<RawEval | 'dead'> =>
    new Promise<RawEval | 'dead'>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let check: ReturnType<typeof setInterval> | undefined;
      let timerStarted = 0;
      let extensions = 0;
      const stop = () => {
        settled = true;
        clearTimeout(timer);
        clearInterval(check);
        restarts.delete(startTimers);
      };
      /** Asks the engine whether it is alive; null when the page slept meanwhile (no verdict). */
      const alive = async (ping: (waitMs: number) => Promise<boolean>): Promise<boolean | null> => {
        const asked = Date.now();
        const answered = await ping.call(engine, PING_WAIT_MS);
        return answered || !slept(asked, PING_WAIT_MS) ? answered : null;
      };
      const onTimeout = async () => {
        if (settled) return;
        // Overdue because the page slept: not the engine's fault.
        if (slept(timerStarted, searchTimeoutMs)) {
          startTimers();
          return;
        }
        if (!engine.ping) {
          stop();
          reject(
            new EngineError(
              'engine-crashed',
              `no answer from the engine within ${searchTimeoutMs} ms`,
            ),
          );
          return;
        }
        // Not on the clock alone: an engine that still answers is slow, not dead.
        const verdict = await alive(engine.ping);
        if (settled) return;
        if (verdict === null || (verdict && extensions < MAX_EXTENSIONS)) {
          if (verdict) extensions += 1;
          startTimers();
          return;
        }
        stop();
        resolve('dead');
      };
      const startTimers = () => {
        clearTimeout(timer);
        clearInterval(check);
        timerStarted = Date.now();
        timer = setTimeout(() => void onTimeout(), searchTimeoutMs);
        // An engine that stops answering is found within LIVENESS_EVERY_MS + PING_WAIT_MS, long
        // before the time limit (B2-02), instead of after it.
        const ping = engine.ping;
        if (ping) {
          check = setInterval(() => {
            void alive(ping).then((verdict) => {
              if (verdict !== false || settled) return;
              stop();
              resolve('dead');
            });
          }, LIVENESS_EVERY_MS);
        }
      };
      startTimers();
      restarts.add(startTimers);
      engine.evaluate(fen, depth, signal).then(
        (result) => {
          if (settled) return;
          stop();
          resolve(result);
        },
        (error: unknown) => {
          if (settled) return;
          stop();
          reject(error);
        },
      );
    });

  /**
   * One search on an idle engine of the pool. A position already evaluated in an earlier, failed
   * run of this game is not searched again (B2-02); an engine that stops answering is closed and
   * the position goes to a newly started one, while there are spares.
   */
  const evaluate = async (fen: string, depth: number, signal?: AbortSignal): Promise<RawEval> => {
    const saved = kept.get(fen);
    if (saved) return saved;
    let engine = idle.pop();
    if (!engine) throw new EngineError('engine-crashed', 'no free engine');
    for (;;) {
      engine.newGame();
      const result = await searchOn(engine, fen, depth, signal);
      if (result !== 'dead') {
        idle.push(engine);
        kept.set(fen, result);
        return result;
      }
      engine.close();
      if (spare <= 0) throw new EngineError('engine-crashed', 'the engine stopped answering');
      spare -= 1;
      engine = await startEngine();
      if (run.signal.aborted) throw new EngineError('cancelled');
    }
  };

  const cloud = options.useCloudEval
    ? (fen: string) =>
        fetchCloudEval(fen, {
          multiPv: MULTI_PV,
          minDepth: options.depth,
          fetch: deps.fetch,
          signal: run.signal,
        })
    : undefined;

  const known: PositionEval[] = [];
  const positions = await evaluateGame(
    game,
    { depth: options.depth, multiPv: MULTI_PV, concurrency: count },
    { engine: { evaluate }, cloud, whiteExpected: expectedPoints },
    (position, done, total) => {
      known.push(position);
      run.emit({ type: 'position', position, done, total });

      // The move that led here can be reviewed now: both of its positions are known. Built by
      // the same function as the finished analysis, so the label shown now is the final one.
      const input = moveInputAt(game, known, position.ply - 1, lastBookPly);
      if (input) run.emit({ type: 'move', review: reviewMove(input) });
    },
    run.signal,
  ).finally(stopWatching);

  let analysis: GameAnalysis;
  try {
    analysis = buildAnalysis({
      game,
      positions,
      opening,
      engine: engineInfo,
      createdAt: (deps.now ?? (() => new Date()))().toISOString(),
    });
  } catch (error) {
    throw new EngineError('unsupported-game', error instanceof Error ? error.message : null);
  }
  run.closeEngine();
  run.emit({ type: 'completed', analysis });
}
