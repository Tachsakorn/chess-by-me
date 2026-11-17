/**
 * Evaluates single positions on demand, for the moves a reader tries on the review board ("try
 * your own move", owner, 2026-11-16). One engine, made when the first search is needed and kept
 * until `close`. Every position is searched the way the game analysis searches it: from a cleared
 * engine (`ucinewgame` first), to the same depth, with the same number of lines and the same
 * hash, so a position gets the evaluation the game analysis would have given it.
 *
 * The caller says which positions it wants now, in order (`want`). They are searched one at a
 * time. A search whose position is no longer wanted is stopped. Every result is remembered by
 * FEN for as long as the evaluator lives; nothing is saved on the device.
 */
import type { AnalysisError, AnalysisOptions, PositionEval } from '@/contract';
import { ENGINE_HASH_MB, MULTI_PV, type AnalysisEngine, type AnalyzeGameDeps } from './analyzeGame';
import { expectedPoints } from './classify';
import { EngineError, evaluatePosition, type RawEval } from './engine';
import { searchTimeoutMs as searchTimeoutFor } from './searchTimeout';

export type PositionEvaluatorDeps = Pick<
  AnalyzeGameDeps,
  'createEngine' | 'prepareEngine' | 'onResume' | 'searchTimeoutMs'
>;

export interface PositionEvaluator {
  /**
   * The positions wanted now (FENs), in the order to search them. Replaces what was wanted
   * before: the search in progress is stopped when its position is not in the new list.
   */
  want(fens: readonly string[]): void;
  /** The evaluation of a position, once made or remembered. Its `ply` is not the caller's. */
  get(fen: string): PositionEval | undefined;
  /** Evaluations made elsewhere (the game analysis): never searched again. */
  remember(positions: readonly PositionEval[]): void;
  /** Why searching stopped; null while all is well. Nothing is searched until `retry`. */
  error(): AnalysisError | null;
  /** After a failure: a new engine, and the wanted positions again. */
  retry(): void;
  /** Stops and closes the engine. Nothing is reported afterwards. */
  close(): void;
}

function toAnalysisError(error: unknown): AnalysisError {
  if (error instanceof EngineError) return { code: error.code, detail: error.detail };
  return { code: 'engine-crashed', detail: error instanceof Error ? error.message : String(error) };
}

/**
 * `onChange` is called whenever a new evaluation is known or a failure is recorded, never
 * synchronously from `want`.
 */
export function createPositionEvaluator(
  deps: PositionEvaluatorDeps,
  options: AnalysisOptions,
  onChange: () => void,
): PositionEvaluator {
  const known = new Map<string, PositionEval>();
  let wanted: readonly string[] = [];
  let running: { fen: string; controller: AbortController } | null = null;
  let engine: Promise<AnalysisEngine> | null = null;
  let failure: AnalysisError | null = null;
  let closed = false;
  const searchTimeoutMs = deps.searchTimeoutMs ?? searchTimeoutFor(options.depth);

  /** The one engine, started; made on the first search that needs it. */
  const ready = (): Promise<AnalysisEngine> => {
    engine ??= (async () => {
      if (deps.prepareEngine) {
        await deps
          .prepareEngine(options.engine, () => {})
          .catch((error: unknown) => {
            throw new EngineError(
              'engine-load-failed',
              `engine download: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      }
      const created = deps.createEngine(options.engine);
      try {
        await created.start({ multiPv: MULTI_PV, hashMb: ENGINE_HASH_MB });
      } catch (error) {
        created.close();
        throw error;
      }
      if (closed) created.close();
      return created;
    })();
    return engine;
  };

  const closeEngine = () => {
    const open = engine;
    engine = null;
    void open?.then(
      (created) => created.close(),
      () => {},
    );
  };

  /** One search, from a cleared engine, given up when the engine stops answering. */
  const search = async (fen: string, depth: number, signal?: AbortSignal): Promise<RawEval> => {
    const created = await ready();
    if (closed || signal?.aborted) throw new EngineError('cancelled');
    return new Promise<RawEval>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const startTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          reject(
            new EngineError(
              'engine-crashed',
              `no answer from the engine within ${searchTimeoutMs} ms`,
            ),
          );
        }, searchTimeoutMs);
      };
      startTimer();
      // A phone suspends the engine with the page: the search gets its full time again.
      const stopListening = deps.onResume?.(startTimer) ?? (() => {});
      const settle = () => {
        clearTimeout(timer);
        stopListening();
      };
      created.newGame();
      created.evaluate(fen, depth, signal).then(
        (result) => {
          settle();
          resolve(result);
        },
        (error: unknown) => {
          settle();
          reject(error);
        },
      );
    });
  };

  const pump = () => {
    if (closed || running || failure) return;
    const fen = wanted.find((candidate) => !known.has(candidate));
    if (fen === undefined) return;
    const mine = { fen, controller: new AbortController() };
    running = mine;
    evaluatePosition(
      fen,
      { depth: options.depth, multiPv: MULTI_PV },
      { engine: { evaluate: search }, whiteExpected: expectedPoints },
      mine.controller.signal,
    ).then(
      (position) => {
        if (running === mine) running = null;
        if (closed) return;
        known.set(fen, position);
        onChange();
        pump();
      },
      (error: unknown) => {
        if (running === mine) running = null;
        if (closed) return;
        // Stopped because the position is no longer wanted: on to what is wanted now.
        if (mine.controller.signal.aborted) {
          pump();
          return;
        }
        failure = toAnalysisError(error);
        closeEngine();
        onChange();
      },
    );
  };

  return {
    want(fens) {
      if (closed) return;
      wanted = [...fens];
      if (running && !wanted.includes(running.fen)) {
        running.controller.abort();
        running = null;
      }
      pump();
    },
    get: (fen) => known.get(fen),
    remember(positions) {
      for (const position of positions) known.set(position.fen, position);
    },
    error: () => failure,
    retry() {
      if (closed || !failure) return;
      failure = null;
      pump();
    },
    close() {
      if (closed) return;
      closed = true;
      wanted = [];
      running?.controller.abort();
      running = null;
      closeEngine();
    },
  };
}
