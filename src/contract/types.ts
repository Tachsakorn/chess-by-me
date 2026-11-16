/**
 * THE CONTRACT
 *
 * Shared shapes between the analysis/data layers and the UI. The UI reads
 * these and never computes chess evaluation itself; the logic layers produce
 * these and never touch the UI.
 *
 * Changing anything here needs the owner's approval (PROJECT_BRIEF section 1).
 * Adding an optional field or a new tag is a compatible change; renaming,
 * removing or changing meaning is a breaking change and bumps CONTRACT_VERSION.
 *
 * Conventions used everywhere:
 * - `ply` counts half-moves. Position 0 is the start; position N is the board
 *   after N plies. Move N (1-based) leads from position N-1 to position N.
 * - Every evaluation is from WHITE's point of view, whoever is to move.
 * - Probabilities ("expected points") run 0..1, where 1 = White wins.
 * - Accuracy runs 0..100.
 * - No display text lives here. The UI turns codes into words per language.
 */

export const CONTRACT_VERSION = 1;

// ---------------------------------------------------------------------------
// Game record: one imported game, before any analysis
// ---------------------------------------------------------------------------

export type Color = 'white' | 'black';

export type GameSource = 'chesscom' | 'lichess' | 'pgn';

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

/** How the game ended. `unknown` when the source does not say. */
export type Termination =
  | 'checkmate'
  | 'resignation'
  | 'timeout'
  | 'abandonment'
  | 'stalemate'
  | 'repetition'
  | 'fifty-move'
  | 'insufficient-material'
  | 'timeout-vs-insufficient-material'
  | 'agreement'
  | 'unknown';

export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily';

export interface TimeControl {
  /** The raw value from the source, e.g. "600+0" or "1/86400". */
  raw: string;
  /** Starting clock in seconds; null for daily/correspondence or unknown. */
  initialSeconds: number | null;
  /** Increment per move in seconds; null when unknown. */
  incrementSeconds: number | null;
  timeClass: TimeClass | null;
}

export interface PlayerInfo {
  name: string;
  /** Rating shown by the source at game time; null when absent. */
  rating: number | null;
  /** Title such as "GM" or "IM"; null when none. */
  title: string | null;
}

export interface GameMove {
  /** 1-based half-move index. */
  ply: number;
  /** Full-move number as printed in notation (1, 1, 2, 2, ...). */
  moveNumber: number;
  color: Color;
  /** Standard algebraic notation, e.g. "Nxe5+". */
  san: string;
  /** UCI notation, e.g. "f3e5" or "e7e8q". */
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Mover's remaining clock after this move, in seconds; null when unknown. */
  clockSeconds: number | null;
  /** Time the mover spent on this move, in seconds; null when unknown. */
  spentSeconds: number | null;
}

export interface GameRecord {
  /** Stable id: "<source>:<id at source>", or "pgn:<hash>" for pasted games. */
  id: string;
  source: GameSource;
  /** Link back to the game at its source; null for pasted PGN. */
  sourceUrl: string | null;
  /** ISO 8601 UTC start time; null when unknown. */
  playedAt: string | null;
  white: PlayerInfo;
  black: PlayerInfo;
  result: GameResult;
  termination: Termination;
  timeControl: TimeControl | null;
  rated: boolean | null;
  /** Only standard chess from the normal starting position is supported in v1. */
  initialFen: string;
  moves: GameMove[];
  /** The original PGN text as received. */
  pgn: string;
}

// ---------------------------------------------------------------------------
// Importing games
// ---------------------------------------------------------------------------

export type ImportRequest =
  | { source: 'chesscom'; username: string }
  | { source: 'lichess'; username: string }
  | { source: 'pgn'; text: string };

export type ImportErrorCode =
  | 'user-not-found'
  | 'no-games'
  | 'invalid-pgn'
  | 'rate-limited'
  | 'network'
  | 'source-unavailable'
  | 'cancelled';

export interface ImportError {
  code: ImportErrorCode;
  /** Technical detail for logs and bug reports. Never shown as the main message. */
  detail: string | null;
}

export type ImportResult =
  | {
      ok: true;
      /** Newest first. */
      games: GameRecord[];
      /** Games left out because they are variants or unreadable. */
      skipped: number;
    }
  | { ok: false; error: ImportError };

export type ImportGames = (request: ImportRequest, signal?: AbortSignal) => Promise<ImportResult>;

// ---------------------------------------------------------------------------
// Evaluation of one position
// ---------------------------------------------------------------------------

/**
 * Engine verdict on a position, from White's point of view.
 * - `cp`: centipawns; +100 is roughly one pawn up for White.
 * - `mate`: forced mate in `moves` (always >= 1); `winner` delivers it.
 * - `over`: the game has ended in this position; `winner` is null for a draw.
 */
export type Score =
  | { kind: 'cp'; value: number }
  | { kind: 'mate'; moves: number; winner: Color }
  | { kind: 'over'; winner: Color | null };

export interface EngineLine {
  /** 1 = the engine's first choice. */
  rank: number;
  score: Score;
  /** The line in UCI and SAN, same length, starting with the suggested move. */
  uci: string[];
  san: string[];
}

export type EvalSource = 'engine' | 'cloud' | 'rules';

export interface PositionEval {
  /** 0 = starting position, N = after N plies. */
  ply: number;
  fen: string;
  /** Verdict on the position: the score of the best line, or `over`. */
  score: Score;
  /** Expected points for White, 0..1. This is what the eval graph and bar plot. */
  whiteExpected: number;
  /** Search depth reached; 0 when the game is over in this position. */
  depth: number;
  /** Best lines, rank 1 first. Empty when the game is over in this position. */
  lines: EngineLine[];
  /** `rules` = decided by the rules of chess (mate, stalemate), no search needed. */
  source: EvalSource;
}

// ---------------------------------------------------------------------------
// Review of one move
// ---------------------------------------------------------------------------

/** Ordered best to worst is NOT implied by this list; see MOVE_CATEGORIES. */
export type MoveCategory =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

/** Display order used for summary tables. */
export const MOVE_CATEGORIES: readonly MoveCategory[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

/**
 * Facts that explain why a move got its category. The UI builds the short
 * note under the current move from these. New tags may be added later.
 */
export type MoveTag =
  /** The move gives up material and is still the right idea. */
  | 'sacrifice'
  /** Every other move was clearly worse. */
  | 'only-good-move'
  /** The only legal move. */
  | 'forced'
  /** A forced mate was available and was not played. */
  | 'missed-mate'
  /** A winning continuation was available and was not played. */
  | 'missed-win'
  /** The move lets the opponent force mate. */
  | 'allows-mate'
  /** The move turns a winning or equal position into a losing one. */
  | 'throws-away-advantage';

export interface MoveReview {
  /** Same ply as the GameMove it describes. */
  ply: number;
  category: MoveCategory;
  /** Expected points the mover gave up with this move, 0..1 (0 = nothing lost). */
  pointLoss: number;
  /** Accuracy of this single move, 0..100. */
  accuracy: number;
  /** True when the move played is the engine's first choice. */
  playedIsBest: boolean;
  /** The engine's first choice in the position before the move. */
  best: { uci: string; san: string } | null;
  tags: MoveTag[];
}

// ---------------------------------------------------------------------------
// Whole-game analysis
// ---------------------------------------------------------------------------

export type EngineVariant = 'lite' | 'full';

export interface EngineInfo {
  name: string;
  version: string;
  variant: EngineVariant;
  /** Target search depth per position. */
  depth: number;
  multiPv: number;
}

export interface OpeningInfo {
  /** ECO code such as "C56". */
  eco: string;
  /** English opening name; the source data exists in English only. */
  name: string;
  /**
   * Last ply still in the opening book. Moves up to here are `book`, except those listed in
   * `errorPlies`.
   */
  lastBookPly: number;
  /**
   * Optional, added 2026-11-15 (owner, Fable review A1-05). Plies up to `lastBookPly` that are
   * in the book but are labelled `inaccuracy`, `mistake` or `blunder`, because the move gave up
   * that much (a trap line, a dubious gambit). Increasing. Absent or empty: every move up to
   * `lastBookPly` is `book`, as before.
   */
  errorPlies?: number[];
}

export interface RatingRange {
  low: number;
  high: number;
}

export interface PlayerSummary {
  /** Game accuracy, 0..100. */
  accuracy: number;
  /** Always a range, never a single number. Null when there is too little to go on. */
  estimatedRating: RatingRange | null;
  /** How many of this player's moves fell in each category. */
  counts: Record<MoveCategory, number>;
}

export interface GameAnalysis {
  contractVersion: typeof CONTRACT_VERSION;
  gameId: string;
  /** ISO 8601 UTC time the analysis finished. */
  createdAt: string;
  engine: EngineInfo;
  opening: OpeningInfo | null;
  /** One entry per position: length = number of moves + 1. */
  positions: PositionEval[];
  /** One entry per move: length = number of moves. */
  moves: MoveReview[];
  white: PlayerSummary;
  black: PlayerSummary;
  /**
   * Which version of the move-labelling rules gave the categories (added 2026-11-15, Fable
   * review). Absent in analyses made before then. A saved analysis whose rules are older than
   * the app's is analysed again when its game is opened.
   */
  rulesVersion?: number;
}

// ---------------------------------------------------------------------------
// Running an analysis (results stream in move by move)
// ---------------------------------------------------------------------------

export interface AnalysisOptions {
  engine: EngineVariant;
  depth: number;
  /** Ask Lichess cloud eval first and only search locally on a miss. */
  useCloudEval: boolean;
}

export type AnalysisErrorCode =
  'engine-load-failed' | 'engine-crashed' | 'out-of-memory' | 'unsupported-game' | 'cancelled';

export interface AnalysisError {
  code: AnalysisErrorCode;
  detail: string | null;
}

/**
 * Events arrive in this order:
 * `started`, then for each position a `position` (and a `move` as soon as the
 * positions on both sides of that move are known), `opening` at most once at
 * any point, and finally exactly one of `completed` or `failed`.
 * `done`/`total` count positions and are real progress, not an estimate.
 */
export type AnalysisEvent =
  | { type: 'started'; gameId: string; engine: EngineInfo; total: number }
  | { type: 'engine-loading'; loadedBytes: number; totalBytes: number | null }
  | { type: 'position'; position: PositionEval; done: number; total: number }
  | { type: 'move'; review: MoveReview }
  | { type: 'opening'; opening: OpeningInfo | null }
  | { type: 'completed'; analysis: GameAnalysis }
  | { type: 'failed'; error: AnalysisError };

export interface AnalysisHandle {
  /** Stops the run; a `failed` event with code `cancelled` follows. */
  cancel(): void;
}

export type AnalyzeGame = (
  game: GameRecord,
  options: AnalysisOptions,
  onEvent: (event: AnalysisEvent) => void,
) => AnalysisHandle;
