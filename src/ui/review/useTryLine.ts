/**
 * The evaluations and labels of the reader's own line ("try your own move", owner, 2026-11-16).
 * The engine and what it found live in a small store outside React, made with the screen and
 * closed with it: nothing of a line is saved, and the engine stops when the screen is left.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  compareWithGameMove,
  createTryEvaluator,
  loadOpeningBook,
  reviewTriedMove,
  type OpeningBook,
  type PositionEvaluator,
  type TriedLine,
} from '@/analysis';
import type { GameRecord, MoveReview, PositionEval } from '@/contract';
import type { AnalysisState } from './analysisState';
import type { TryLine } from './tryLine';
import type { Comparison } from './tryPanel';

interface TryStore {
  subscribe(listener: () => void): () => void;
  version(): number;
  /**
   * The positions the line needs now; `known` are the game's own, never searched again. `depth`
   * is the depth the game was analysed at.
   */
  want(fens: readonly string[], known: readonly PositionEval[], depth: number | undefined): void;
  get(fen: string): PositionEval | undefined;
  book(): OpeningBook | null;
  failed(): boolean;
  retry(): void;
  /** Stops the engine. A later `want` starts a new one. */
  close(): void;
}

function createTryStore(): TryStore {
  const listeners = new Set<() => void>();
  let count = 0;
  let evaluator: PositionEvaluator | null = null;
  let book: OpeningBook | null = null;
  let bookRequest: Promise<void> | null = null;
  let bookFailed = false;
  const notify = () => {
    count += 1;
    for (const listener of listeners) listener();
  };
  // The same book as the game analysis; a book that cannot be loaded is a failure, never a
  // label without Book (as in the analysis, Fable review A1-03).
  const loadBook = () => {
    bookFailed = false;
    bookRequest ??= loadOpeningBook().then(
      (loaded) => {
        book = loaded;
        notify();
      },
      () => {
        bookRequest = null;
        bookFailed = true;
        notify();
      },
    );
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => count,
    want(fens, known, depth) {
      if (fens.length === 0 && !evaluator) return;
      if (!book) loadBook();
      evaluator ??= createTryEvaluator(notify, depth);
      evaluator.remember(known);
      evaluator.want(fens);
      // What was known already is on screen at once.
      notify();
    },
    get: (fen) => evaluator?.get(fen),
    book: () => book,
    failed: () => bookFailed || (evaluator?.error() ?? null) !== null,
    retry() {
      if (bookFailed) loadBook();
      evaluator?.retry();
      notify();
    },
    close() {
      evaluator?.close();
      evaluator = null;
    },
  };
}

export interface TryResult {
  /** The evaluation after each move of the line; undefined until known. */
  evals: readonly (PositionEval | undefined)[];
  /** The review of each move of the line; null until known. */
  reviews: readonly (MoveReview | null)[];
  /** How the first move of the line did against the game move. */
  compare: Comparison | null;
  /** The engine or the opening book could not be used. */
  failed: boolean;
  retry(): void;
}

const NOTHING: TryResult = { evals: [], reviews: [], compare: null, failed: false, retry() {} };

/** `state` is the finished analysis of `game`; `line` is null while the reader is in the game. */
export function useTryLine(
  game: GameRecord,
  state: AnalysisState,
  line: TryLine | null,
): TryResult {
  const [store] = useState(createTryStore);
  const version = useSyncExternalStore(store.subscribe, store.version);
  const moves = line?.moves;

  useEffect(() => {
    const ask = () =>
      store.want(
        (moves ?? []).map((move) => move.fenAfter),
        state.positions.filter((position) => position !== undefined),
        state.depth,
      );
    ask();
    // The engine stops with the page (as the game analysis does) and, if the browser keeps the
    // page and brings it back, the line is evaluated again.
    const onHide = () => store.close();
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) ask();
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
    };
  }, [store, moves, state.positions, state.depth]);

  // Leaving the screen stops the engine.
  useEffect(() => () => store.close(), [store]);

  return useMemo(() => {
    if (!line) return NOTHING;
    // `version` changes whenever the store learns something: that is what this depends on.
    void version;
    const evals = line.moves.map((move) => {
      const found = store.get(move.fenAfter);
      return found ? { ...found, ply: move.ply } : undefined;
    });
    const positions = state.positions.filter((position) => position !== undefined);
    const tried: TriedLine = {
      game,
      positions,
      opening: state.opening ?? null,
      from: line.from,
      moves: line.moves,
      evals,
    };
    const book = store.book();
    return {
      evals,
      reviews: line.moves.map((_, index) => (book ? reviewTriedMove(tried, index, book) : null)),
      compare: compareWithGameMove(tried),
      failed: store.failed(),
      retry: store.retry,
    };
  }, [game, state, line, store, version]);
}
