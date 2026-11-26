/**
 * The engine lines of the analysis board (2026-11-26): one position at a time, searched while the
 * reader looks at it, with the result so far shown as it deepens.
 *
 * What this is for is the lines, the arrow and the bar. The move labels do not come from here:
 * they come from a search exactly like the game analysis's (`createTryEvaluator`, 2 lines, the
 * depth in Settings, owner 2026-11-26), so a label on the analysis board is the label the game
 * review would give.
 *
 * A search stops at the depth in Settings or after the time per move, whichever comes first
 * (owner, 2026-11-26, choice "ก"). Showing another position stops the search under way. A
 * finished result is remembered by FEN for as long as the evaluator lives; one stopped half way is
 * searched again from the start when the position is shown again. Nothing is saved on the device.
 */
import type { AnalysisError, EngineVariant, PositionEval } from '@/contract';
import { ENGINE_HASH_MB, type AnalyzeGameDeps } from './analyzeGame';
import { expectedPoints } from './classify';
import { EngineError, evaluatePosition, type RawEval, type SearchOptions } from './engine';

/** The lines shown on the analysis board (the design: three). */
export const LIVE_LINES = 3;

/** An engine that can search with a time limit and report progress (UciEngine). */
export interface LiveEngine {
  start(options: { multiPv: number; hashMb?: number }): Promise<void>;
  newGame(): void;
  evaluate(
    fen: string,
    depth: number,
    signal?: AbortSignal,
    options?: SearchOptions,
  ): Promise<RawEval>;
  close(): void;
}

export interface LiveEvaluatorDeps {
  createEngine(variant: EngineVariant): LiveEngine;
  prepareEngine?: AnalyzeGameDeps['prepareEngine'];
}

export interface LiveOptions {
  engine: EngineVariant;
  /** The depth in Settings: the search stops there at the latest. */
  depth: number;
  /** The time per move: the search stops then at the latest. */
  movetimeMs: number;
}

export interface LiveEval {
  position: PositionEval;
  /** False while the search goes on: the lines may still change. */
  done: boolean;
}

export interface LiveEvaluator {
  /** The position to search now; null for none. Stops a search of another position. */
  show(fen: string | null): void;
  /** What is known of a position: finished, or the result so far of the search under way. */
  get(fen: string): LiveEval | undefined;
  /** Why searching stopped; null while all is well. Nothing is searched until `retry`. */
  error(): AnalysisError | null;
  retry(): void;
  /** Stops and closes the engine. Nothing is reported afterwards. */
  close(): void;
}

/** How long past its time a search may go without an answer before the engine is judged dead. */
const ANSWER_GRACE_MS = 15_000;

function toAnalysisError(error: unknown): AnalysisError {
  if (error instanceof EngineError) return { code: error.code, detail: error.detail };
  return { code: 'engine-crashed', detail: error instanceof Error ? error.message : String(error) };
}

/**
 * The engine's raw result turned into a `PositionEval` by the same code that turns the game
 * analysis's searches into evaluations (`evaluatePosition`), fed the result it already has.
 */
function toPosition(fen: string, raw: RawEval): Promise<PositionEval> {
  return evaluatePosition(
    fen,
    { depth: Math.max(1, raw.depth), multiPv: LIVE_LINES },
    { engine: { evaluate: () => Promise.resolve(raw) }, whiteExpected: expectedPoints },
  );
}

/** `onChange` is called whenever something new is known or a failure is recorded. */
export function createLiveEvaluator(
  deps: LiveEvaluatorDeps,
  options: LiveOptions,
  onChange: () => void,
): LiveEvaluator {
  const known = new Map<string, LiveEval>();
  let shown: string | null = null;
  let running: { fen: string; controller: AbortController } | null = null;
  let engine: Promise<LiveEngine> | null = null;
  let failure: AnalysisError | null = null;
  let closed = false;

  const ready = (): Promise<LiveEngine> => {
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
        await created.start({ multiPv: LIVE_LINES, hashMb: ENGINE_HASH_MB });
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

  /** One search of `fen`, from a cleared engine, reporting as it deepens. */
  const search = async (fen: string, signal: AbortSignal): Promise<RawEval> => {
    const created = await ready();
    if (closed || signal.aborted) throw new EngineError('cancelled');
    created.newGame();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const silent = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new EngineError(
              'engine-crashed',
              `no answer from the engine within ${options.movetimeMs + ANSWER_GRACE_MS} ms`,
            ),
          ),
        options.movetimeMs + ANSWER_GRACE_MS,
      );
    });
    try {
      return await Promise.race([
        created.evaluate(fen, options.depth, signal, {
          movetimeMs: options.movetimeMs,
          onProgress: (soFar) => {
            void toPosition(fen, soFar).then((position) => {
              // A later report or the final result may already be here.
              if (closed || signal.aborted || known.get(fen)?.done) return;
              known.set(fen, { position, done: false });
              onChange();
            });
          },
        }),
        silent,
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  const pump = () => {
    if (closed || running || failure || shown === null) return;
    const fen = shown;
    if (known.get(fen)?.done) return;
    const mine = { fen, controller: new AbortController() };
    running = mine;
    // Positions decided by the rules (mate, stalemate) never reach the engine.
    evaluatePosition(
      fen,
      { depth: options.depth, multiPv: LIVE_LINES },
      {
        engine: { evaluate: (position, _depth, signal) => search(position, signal!) },
        whiteExpected: expectedPoints,
      },
      mine.controller.signal,
    ).then(
      (position) => {
        if (running === mine) running = null;
        if (closed) return;
        known.set(fen, { position, done: true });
        onChange();
        pump();
      },
      (error: unknown) => {
        if (running === mine) running = null;
        if (closed) return;
        if (mine.controller.signal.aborted) {
          // Stopped half way: what it found is not kept as if finished.
          if (known.get(fen)?.done === false) known.delete(fen);
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
    show(fen) {
      if (closed) return;
      shown = fen;
      if (running && running.fen !== fen) {
        running.controller.abort();
        running = null;
      }
      pump();
    },
    get: (fen) => known.get(fen),
    error: () => failure,
    retry() {
      if (closed || !failure) return;
      failure = null;
      onChange();
      pump();
    },
    close() {
      if (closed) return;
      closed = true;
      shown = null;
      running?.controller.abort();
      running = null;
      closeEngine();
    },
  };
}
