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

/** What `analyzeGame` needs from an engine; `UciEngine` fits. */
export interface AnalysisEngine {
  start(options: { multiPv: number; hashMb?: number }): Promise<void>;
  newGame(): void;
  evaluate(fen: string, depth: number, signal?: AbortSignal): Promise<RawEval>;
  close(): void;
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
  /** A single search that takes longer than this counts as a dead engine. Default 120 s. */
  searchTimeoutMs?: number;
  /**
   * Gets the engine's files ready before `createEngine` (the browser downloads them, reporting
   * progress), so the engine's own 30-second start limit counts only once they are here
   * (Fable review A8-01). A failure fails the run with `engine-load-failed`.
   */
  prepareEngine?(
    variant: EngineVariant,
    progress: (loadedBytes: number, totalBytes: number | null) => void,
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
const DEFAULT_SEARCH_TIMEOUT_MS = 120_000;
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
  return (game, options, onEvent) => {
    const controller = new AbortController();
    let finished = false;
    let engines: AnalysisEngine[] = [];

    const run: Run = {
      signal: controller.signal,
      emit(event) {
        if (finished) return;
        if (event.type === 'completed' || event.type === 'failed') finished = true;
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
    analyze(deps, game, options, run)
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

async function analyze(
  deps: AnalyzeGameDeps,
  game: GameRecord,
  options: AnalysisOptions,
  run: Run,
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
      .prepareEngine(options.engine, (loadedBytes, totalBytes) => {
        if (!run.signal.aborted) run.emit({ type: 'engine-loading', loadedBytes, totalBytes });
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
  const pool: AnalysisEngine[] = [];
  for (let i = 0; i < count; i += 1) {
    const engine = deps.createEngine(options.engine);
    run.useEngine(engine);
    pool.push(engine);
  }
  await Promise.all(
    pool.map((engine) => engine.start({ multiPv: MULTI_PV, hashMb: ENGINE_HASH_MB })),
  );
  if (run.signal.aborted) return;
  const idle = [...pool];

  const searchTimeoutMs = deps.searchTimeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS;
  /** Restart the time limits of the searches in progress. */
  const restarts = new Set<() => void>();
  const stopListening =
    deps.onResume?.(() => {
      for (const restart of restarts) restart();
    }) ?? (() => {});
  /**
   * One search on an idle engine of the pool, from a cleared engine (`ucinewgame` first), so the
   * result depends on the position alone and not on what that engine searched before. An engine
   * that stops answering is given up on.
   */
  const evaluate = (fen: string, depth: number, signal?: AbortSignal): Promise<RawEval> => {
    const engine = idle.pop();
    if (!engine) return Promise.reject(new EngineError('engine-crashed', 'no free engine'));
    return new Promise<RawEval>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const startTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          restarts.delete(startTimer);
          reject(
            new EngineError(
              'engine-crashed',
              `no answer from the engine within ${searchTimeoutMs} ms`,
            ),
          );
          run.closeEngine();
        }, searchTimeoutMs);
      };
      startTimer();
      restarts.add(startTimer);
      engine.newGame();
      engine.evaluate(fen, depth, signal).then(
        (result) => {
          clearTimeout(timer);
          restarts.delete(startTimer);
          idle.push(engine);
          resolve(result);
        },
        (error: unknown) => {
          clearTimeout(timer);
          restarts.delete(startTimer);
          reject(error);
        },
      );
    });
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
  ).finally(stopListening);

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
