/**
 * Analyses games one at a time (BRIEF-UI 6.3: "Analyze" starts the analysis without leaving the
 * list; more requests wait their turn). The game opened on the review screen goes first
 * (BRIEF-UI 6.2: "starts at once"): the run in progress is stopped and put back at the head of
 * the line. Each finished analysis is checked against the contract and saved on the device.
 *
 * While a game runs, its `AnalysisState` (src/ui/review/analysisState.ts) is kept here, so the
 * review screen shows every move as it arrives, whichever screen started the run. Once a game is
 * finished and saved only the latest one is kept (Fable review A8-03); the review screen keeps
 * its own copy of the game it shows.
 *
 * A run stopped because another game was opened is not done again later unless the user asked
 * for it with Analyze (or opens it again): nobody may come back to it (A8-03).
 */
import { create } from 'zustand';
import { analyzeGame, APP_ANALYSIS_OPTIONS } from '@/analysis';
import type { AnalysisHandle, GameRecord } from '@/contract';
import { local } from '@/data/local';
import {
  analysisReducer,
  initialAnalysisState,
  type AnalysisState,
} from '@/ui/review/analysisState';
import { useApp } from './appStore';
import { setQueuedGames } from './queuedGames';

interface QueueState {
  /** The game being analysed now. */
  running: string | null;
  /** 0..100: positions done of the running game. */
  percent: number;
  /** 0..100 while the engine is being downloaded for the running game; null otherwise. */
  download: number | null;
  waiting: string[];
  /** Games whose last run failed. */
  failed: string[];
  /** The state of the running game, and of the last one finished here. */
  live: Record<string, AnalysisState>;
  /** Adds a game to the end of the line, or with `first` puts it ahead of everything. */
  enqueue(game: GameRecord, options?: { first?: boolean }): void;
}

const games = new Map<string, GameRecord>();
/** Games the user asked for with Analyze in a list: put back in line if another game cuts in. */
const asked = new Set<string>();
let handle: AnalysisHandle | null = null;
/** The run whose events count; a run stopped to let another game go first is ignored. */
let token: object | null = null;

export const useAnalysisQueue = create<QueueState>()((set, get) => {
  function start() {
    const [id, ...rest] = get().waiting;
    const game = id ? games.get(id) : undefined;
    if (!id || !game) {
      set({ running: null, percent: 0, download: null, waiting: [] });
      return;
    }
    set({
      running: id,
      percent: 0,
      download: null,
      waiting: rest,
      live: { ...get().live, [id]: initialAnalysisState(game) },
    });
    const mine = {};
    token = mine;
    handle = analyzeGame(game, APP_ANALYSIS_OPTIONS, (event) => {
      if (token !== mine) return;
      const state = get().live[id];
      if (state) set({ live: { ...get().live, [id]: analysisReducer(state, event) } });
      if (event.type === 'engine-loading') {
        const share = event.totalBytes ? event.loadedBytes / event.totalBytes : 0;
        set({ download: Math.min(99, Math.floor(share * 100)) });
      } else if (event.type === 'position') {
        set({ percent: Math.floor((event.done / event.total) * 100), download: null });
      } else if (event.type === 'completed') {
        handle = null;
        token = null;
        void local
          .putAnalysis(event.analysis, game)
          .then(() =>
            useApp.getState().addSummary({
              gameId: id,
              white: event.analysis.white.accuracy,
              black: event.analysis.black.accuracy,
            }),
          )
          .catch(() => set({ failed: [...get().failed, id] }))
          .finally(() => finish(id));
      } else if (event.type === 'failed') {
        handle = null;
        token = null;
        set({ failed: [...get().failed, id] });
        finish(id);
      }
    });
  }

  function finish(id: string) {
    games.delete(id);
    asked.delete(id);
    // Keep only the state of the game just finished (and of a game running meanwhile).
    const running = get().running;
    set({
      live: Object.fromEntries(
        Object.entries(get().live).filter(([key]) => key === id || key === running),
      ),
    });
    // Unless another game was put first meanwhile and is already running.
    if (get().running === id) start();
  }

  // Leaving the page stops every engine at once (speed round: up to four run per game). If the
  // browser keeps the page and brings it back (back/forward cache), the game starts again.
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      const { running, waiting } = get();
      const stopped = handle;
      handle = null;
      token = null;
      stopped?.cancel();
      if (running)
        set({ running: null, percent: 0, download: null, waiting: [running, ...waiting] });
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && !get().running && get().waiting.length > 0) start();
    });
  }

  return {
    running: null,
    percent: 0,
    download: null,
    waiting: [],
    failed: [],
    live: {},
    enqueue(game, options = {}) {
      const { running, waiting, failed } = get();
      if (running === game.id) return;
      games.set(game.id, game);
      const others = waiting.filter((id) => id !== game.id);
      const cleared = failed.filter((id) => id !== game.id);
      if (!options.first) {
        asked.add(game.id);
        if (waiting.includes(game.id)) return;
        set({ waiting: [...others, game.id], failed: cleared });
        if (!running) start();
        return;
      }
      // First in line. A run in progress steps back to second place and starts over later only
      // if the user asked for it with Analyze; otherwise it is dropped until opened again.
      const paused = running && handle && asked.has(running) ? [running] : [];
      if (running && !paused.includes(running)) {
        games.delete(running);
        set({
          live: Object.fromEntries(Object.entries(get().live).filter(([key]) => key !== running)),
        });
      }
      const stopped = handle;
      handle = null;
      token = null;
      stopped?.cancel();
      set({ waiting: [game.id, ...paused, ...others], failed: cleared, running: null });
      start();
    },
  };
});

// Games in the queue are never deleted when an account's old games are trimmed (appStore).
useAnalysisQueue.subscribe((state, previous) => {
  if (state.running !== previous.running || state.waiting !== previous.waiting) {
    setQueuedGames(state.running, state.waiting);
  }
});
