/**
 * What the review screen knows about the analysis of its game at any moment,
 * built from the events `analyzeGame` sends. Pure: the hook that runs the
 * analysis (useGameAnalysis.ts) feeds the events in, the screen reads the state.
 *
 * Phases: `preparing` (the engine is being made ready: no figure to show),
 * `analyzing` (positions are arriving: a real count), `done`, `failed` (with the
 * reason) and `cancelled`. Whatever had arrived before a failure or a cancel is
 * kept, so the reader can still go through those moves.
 */
import type {
  AnalysisError,
  AnalysisEvent,
  GameAnalysis,
  GameRecord,
  MoveReview,
  OpeningInfo,
  PlayerSummary,
  PositionEval,
} from '@/contract';

export type AnalysisPhase = 'preparing' | 'analyzing' | 'done' | 'failed' | 'cancelled';

export interface AnalysisState {
  phase: AnalysisPhase;
  /** Moves in the game. */
  moves: number;
  /** Moves reviewed so far: the count the screen shows while analysing. */
  reviewed: number;
  /** Index = ply. An entry is missing while the analysis has not reached that position. */
  positions: readonly (PositionEval | undefined)[];
  /** Index = ply - 1. An entry is missing while the analysis has not reached that move. */
  reviews: readonly (MoveReview | undefined)[];
  /** Null when the game is in no opening book; undefined while that is not known yet. */
  opening: OpeningInfo | null | undefined;
  /** Each side's summary; undefined until the analysis has finished. */
  white: PlayerSummary | undefined;
  black: PlayerSummary | undefined;
  /** Why the analysis stopped; null unless the phase is `failed`. */
  error: AnalysisError | null;
}

export function initialAnalysisState(game: GameRecord): AnalysisState {
  return {
    phase: 'preparing',
    moves: game.moves.length,
    reviewed: 0,
    positions: [],
    reviews: [],
    opening: undefined,
    white: undefined,
    black: undefined,
    error: null,
  };
}

/** An analysis that is already finished, for instance one kept from an earlier visit. */
export function stateFromAnalysis(game: GameRecord, analysis: GameAnalysis): AnalysisState {
  return analysisReducer(initialAnalysisState(game), { type: 'completed', analysis });
}

const ENDED: readonly AnalysisPhase[] = ['done', 'failed', 'cancelled'];

export function analysisReducer(state: AnalysisState, event: AnalysisEvent): AnalysisState {
  // analyzeGame sends nothing after its last event; this guards the screen if anything did.
  if (ENDED.includes(state.phase)) return state;
  switch (event.type) {
    case 'started':
    case 'engine-loading':
      return state;
    case 'opening':
      return { ...state, opening: event.opening };
    case 'position': {
      const positions = [...state.positions];
      positions[event.position.ply] = event.position;
      return { ...state, phase: 'analyzing', positions };
    }
    case 'move': {
      const index = event.review.ply - 1;
      const reviews = [...state.reviews];
      const isNew = reviews[index] === undefined;
      reviews[index] = event.review;
      return { ...state, reviews, reviewed: state.reviewed + (isNew ? 1 : 0) };
    }
    case 'completed': {
      const { analysis } = event;
      return {
        ...state,
        phase: 'done',
        reviewed: analysis.moves.length,
        positions: analysis.positions,
        reviews: analysis.moves,
        opening: analysis.opening,
        white: analysis.white,
        black: analysis.black,
        error: null,
      };
    }
    case 'failed':
      return event.error.code === 'cancelled'
        ? { ...state, phase: 'cancelled' }
        : { ...state, phase: 'failed', error: event.error };
  }
}
