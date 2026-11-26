/**
 * What the analysis board knows about its moves (2026-11-26), from two engines that work apart:
 *
 * - the labels: every position of the line searched exactly as the game analysis searches it
 *   (`createTryEvaluator`: 2 lines, the depth in Settings), so a label here is the label the game
 *   review would give (owner, 2026-11-26). The position on the board and the one before it go
 *   first.
 * - the lines: the position on the board only, 3 lines, shown as they deepen, stopped at the
 *   depth in Settings or the time per move (`createLiveBoardEvaluator`, owner's choice "ก").
 * - the threat, when turned on: the same engine, once the lines are done, searches the position
 *   with the other side to move (`passedPosition`); its best move is the threat. Off by default:
 *   it doubles the engine's work for each position.
 *
 * Both engines live in a small store outside React, made with the screen and closed with it.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  createLiveBoardEvaluator,
  createTryEvaluator,
  findOpening,
  loadOpeningBook,
  reviewTriedMove,
  type LiveEval,
  type LiveEvaluator,
  type OpeningBook,
  type PositionEvaluator,
  type TriedLine,
} from '@/analysis';
import type { GameRecord, MoveReview, PositionEval } from '@/contract';
import { readDepth } from '@/ui/app/analysisDepth';
import { checkAfterLoadFailure, setBusy } from '@/ui/app/appUpdate';
import type { AnalysisState } from '@/ui/review/analysisState';
import { BOARD_GAME, bookMoves, fenAt, START_FEN, type Board } from './boardLine';
import type { BoardSettings } from './boardSettings';
import { passedPosition } from './threat';

/** The engine lines may report many times a second; the screen is drawn at most this often. */
const DRAW_EVERY_MS = 250;

interface BoardStore {
  subscribe(listener: () => void): () => void;
  version(): number;
  /** The positions to label, in the order to search them. */
  label(fens: readonly string[]): void;
  /**
   * The position whose lines to show; null for none (lines, arrow and bar all off). `threat`:
   * the position to search for the threat once those lines are done, or null.
   */
  show(fen: string | null, movetimeMs: number, threat?: string | null): void;
  labelled(fen: string): PositionEval | undefined;
  lines(fen: string): LiveEval | undefined;
  book(): OpeningBook | null;
  failed(): boolean;
  retry(): void;
  close(): void;
}

function createBoardStore(depth: number): BoardStore {
  const listeners = new Set<() => void>();
  let count = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let labels: PositionEvaluator | null = null;
  let live: { evaluator: LiveEvaluator; movetimeMs: number } | null = null;
  let book: OpeningBook | null = null;
  let bookRequest: Promise<void> | null = null;
  let bookFailed = false;
  let shown: { fen: string; threat: string | null } | null = null;

  /** Once the lines of the board are done, the engine goes on to the threat position. */
  const next = () => {
    if (!live || !shown) return;
    const done = live.evaluator.get(shown.fen)?.done === true;
    live.evaluator.show(done && shown.threat ? shown.threat : shown.fen);
  };
  const notify = () => {
    clearTimeout(timer);
    timer = undefined;
    count += 1;
    for (const listener of listeners) listener();
  };
  const notifySoon = () => {
    timer ??= setTimeout(notify, DRAW_EVERY_MS);
  };
  const onLive = () => {
    next();
    notifySoon();
  };
  const loadBook = () => {
    bookFailed = false;
    bookRequest ??= loadOpeningBook().then(
      (loaded) => {
        book = loaded;
        notify();
      },
      (error: unknown) => {
        bookRequest = null;
        bookFailed = true;
        notify();
        void checkAfterLoadFailure(error);
      },
    );
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => count,
    label(fens) {
      if (!book) loadBook();
      labels ??= createTryEvaluator(notify, depth);
      labels.want(fens);
    },
    show(fen, movetimeMs, threat = null) {
      shown = fen === null ? null : { fen, threat };
      if (live && live.movetimeMs !== movetimeMs) {
        // A new time per move: what was found with the old one is not kept.
        live.evaluator.close();
        live = null;
      }
      if (fen === null) {
        live?.evaluator.show(null);
        return;
      }
      live ??= { evaluator: createLiveBoardEvaluator(onLive, depth, movetimeMs), movetimeMs };
      next();
    },
    labelled: (fen) => labels?.get(fen),
    lines: (fen) => live?.evaluator.get(fen),
    book: () => book,
    failed: () =>
      bookFailed ||
      (labels?.error() ?? null) !== null ||
      (live?.evaluator.error() ?? null) !== null,
    retry() {
      if (bookFailed) loadBook();
      labels?.retry();
      live?.evaluator.retry();
      notify();
    },
    close() {
      clearTimeout(timer);
      timer = undefined;
      labels?.close();
      labels = null;
      live?.evaluator.close();
      live = null;
      shown = null;
      // A later label or show (the page brought back) starts new engines.
    },
  };
}

export interface BoardView {
  /** The board's moves as a game, for the panels of the review screen. */
  game: GameRecord;
  /** The labels and evaluations of the line, as the review screen's panels read them. */
  state: AnalysisState;
  /** The lines of the position on the board, while searched or once found. */
  lines: LiveEval | undefined;
  /** The threat (UCI) once found, when it is turned on. */
  threat: string | null;
  /**
   * The evaluation to show for the position on the board: the label search's once known, so the
   * bar and the figure agree with the Move panel; the lines' until then.
   */
  evaluation: PositionEval | undefined;
  /** The opening of the line up to the board, or null outside the book (and at the start). */
  opening: string | null;
  /** Moves from the board that stay in the book (for a book move's panel). */
  nextInBook: readonly string[];
  failed: boolean;
  retry(): void;
}

export function useAnalysisBoard(board: Board, settings: BoardSettings): BoardView {
  const [store] = useState(() => createBoardStore(readDepth()));
  const version = useSyncExternalStore(store.subscribe, store.version);
  const { moves, ply } = board;
  const fen = fenAt(board);
  const wantsLines =
    settings.lines || settings.suggestion || settings.evalBar || settings.threat;
  const threatFen = settings.threat ? passedPosition(fen) : null;
  const movetimeMs = settings.seconds * 1000;

  // What to label: the move on the board first (the positions on both sides of it), then the
  // whole line from the start.
  const order = useMemo(() => {
    const all = [START_FEN, ...moves.map((move) => move.fenAfter)];
    const first = [all[Math.max(0, ply - 1)]!, all[ply]!];
    return [...new Set([...first, ...all])];
  }, [moves, ply]);

  useEffect(() => {
    const ask = () => {
      store.label(order);
      store.show(wantsLines ? fen : null, movetimeMs, threatFen);
    };
    ask();
    // The engines stop with the page; a page the browser brings back asks again.
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
  }, [store, order, fen, wantsLines, movetimeMs, threatFen]);

  // Leaving the screen stops both engines.
  useEffect(() => () => store.close(), [store]);

  // Moves on the board are not saved anywhere but the address: no reload by itself meanwhile.
  const busy = moves.length > 0;
  useEffect(() => {
    setBusy('analysis-board', busy);
    return () => setBusy('analysis-board', false);
  }, [busy]);

  return useMemo(() => {
    // `version` changes whenever the store learns something: that is what this depends on.
    void version;
    const game: GameRecord = { ...BOARD_GAME, moves: [...moves] };
    const start = store.labelled(START_FEN);
    const evals = moves.map((move) => {
      const found = store.labelled(move.fenAfter);
      return found ? { ...found, ply: move.ply } : undefined;
    });
    const positions = [start ? { ...start, ply: 0 } : undefined, ...evals];
    const book = store.book();
    const tried: TriedLine | null = start
      ? { game: BOARD_GAME, positions: [{ ...start, ply: 0 }], opening: null, from: 0, moves, evals }
      : null;
    const reviews: (MoveReview | undefined)[] = moves.map(
      (_, index) => (tried && book ? reviewTriedMove(tried, index, book) : null) ?? undefined,
    );
    const fensAfter = moves.map((move) => move.fenAfter);
    const opening = book ? findOpening(book, fensAfter) : undefined;
    const reviewed = reviews.filter(Boolean).length;
    const state: AnalysisState = {
      phase: reviewed === moves.length && start ? 'done' : 'analyzing',
      moves: moves.length,
      reviewed,
      positions,
      reviews,
      opening,
      white: undefined,
      black: undefined,
      error: null,
    };
    const upToBoard = book ? findOpening(book, fensAfter.slice(0, ply)) : null;
    const lines = store.lines(fen);
    const preferred = lines?.position.lines.map((line) => line.san[0] ?? '') ?? [];
    return {
      game,
      state,
      lines,
      threat: (threatFen && store.lines(threatFen)?.position.lines[0]?.uci[0]) ?? null,
      evaluation: positions[ply] ?? lines?.position,
      opening: upToBoard?.name ?? null,
      nextInBook: book ? bookMoves(book, fen, 3, preferred) : [],
      failed: store.failed(),
      retry: store.retry,
    };
  }, [store, version, moves, ply, fen, threatFen]);
}
