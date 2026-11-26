/**
 * The analysis board (2026-11-26): the moves on it and where the reader is among them. Pure: the
 * screen feeds the actions in and draws the result. Only the rules of chess are used here.
 *
 * One line of moves, no tree (v1, owner 2026-11-26): a move equal to the next one of the line
 * steps forward; any other move replaces the rest of the line.
 *
 * The moves live in the address (`/analysis?moves=e2e4,e7e5`, owner 2026-11-26), so a reload or a
 * shared link shows the same board. Nothing is saved on the device.
 */
import { Chess } from 'chess.js';
import type { GameMove, GameRecord } from '@/contract';
import { findOpening, type OpeningBook } from '@/analysis';
import { navigate, type NavigationAction } from '@/ui/review/model';
import { moveIn } from '@/ui/review/tryLine';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** More moves than any real game: an address longer than this is cut. */
export const MAX_PLIES = 600;

export interface Board {
  moves: readonly GameMove[];
  /** The position shown: 0 = the start, N = after N half-moves. */
  ply: number;
  flipped: boolean;
  /** The last action was one step forward: the board badge plays its animation. */
  stepped?: boolean;
}

export type BoardAction = NavigationAction | { play: string };

export const EMPTY_BOARD: Board = { moves: [], ply: 0, flipped: false };

/** The FEN shown on the board. */
export function fenAt(board: Board): string {
  return board.ply === 0 ? START_FEN : (board.moves[board.ply - 1]?.fenAfter ?? START_FEN);
}

/**
 * What an action does. A move that is not legal in the position shown changes nothing (the
 * same object comes back).
 */
export function boardReducer(board: Board, action: BoardAction): Board {
  if (typeof action === 'string' || 'goTo' in action) {
    const moved = navigate(board, action, board.moves.length);
    return { ...board, ...moved };
  }
  const next = board.moves[board.ply];
  if (next && next.uci === action.play.toLowerCase()) {
    return { ...board, ply: board.ply + 1, stepped: true };
  }
  if (board.ply >= MAX_PLIES) return board;
  const move = moveIn(fenAt(board), action.play, board.ply + 1);
  if (!move) return board;
  return { ...board, moves: [...board.moves.slice(0, board.ply), move], ply: board.ply + 1, stepped: true };
}

/** The moves as they go in the address: "e2e4,e7e5". */
export function movesToParam(moves: readonly GameMove[]): string {
  return moves.map((move) => move.uci).join(',');
}

/** The moves of an address, up to the first one that is not legal (or the limit). */
export function movesFromParam(text: string | null): GameMove[] {
  const moves: GameMove[] = [];
  if (!text) return moves;
  let fen = START_FEN;
  for (const uci of text.split(',')) {
    if (moves.length >= MAX_PLIES) break;
    const move = moveIn(fen, uci.trim(), moves.length + 1);
    if (!move) break;
    moves.push(move);
    fen = move.fenAfter;
  }
  return moves;
}

/**
 * A game with no moves from the normal start, for labelling the board's moves with the code that
 * labels a move tried on the review board (`reviewTriedMove`, a line leaving at the start).
 */
export const BOARD_GAME: GameRecord = Object.freeze({
  id: 'analysis-board',
  source: 'pgn',
  sourceUrl: null,
  playedAt: null,
  white: { name: '', rating: null, title: null },
  black: { name: '', rating: null, title: null },
  result: '*',
  termination: 'unknown',
  timeControl: null,
  rated: null,
  initialFen: START_FEN,
  moves: [],
  pgn: '',
}) as GameRecord;

/**
 * The moves from `fen` that reach a position of the opening book, in SAN ("Bb5"), at most
 * `limit`. The book holds no counts of how often a move is played, so the moves the engine
 * prefers go first (`preferred`, in SAN, best first), then the broadest names: a position named
 * "Ruy Lopez" before one named "King's Knight Opening: Irish Gambit", as a main line tends to
 * have the short name and the side lines the long ones; then the shorter name.
 */
export function bookMoves(
  book: OpeningBook,
  fen: string,
  limit = 3,
  preferred: readonly string[] = [],
): string[] {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }
  const found: Array<{ san: string; parts: number; length: number }> = [];
  for (const candidate of chess.moves({ verbose: true })) {
    const name = findOpening(book, [candidate.after])?.name;
    if (name) found.push({ san: candidate.san, parts: name.split(/[:,]/).length, length: name.length });
  }
  return found
    .sort((a, b) => {
      const rank = (san: string) => {
        const at = preferred.indexOf(san);
        return at < 0 ? preferred.length : at;
      };
      return rank(a.san) - rank(b.san) || a.parts - b.parts || a.length - b.length;
    })
    .slice(0, limit)
    .map((move) => move.san);
}
