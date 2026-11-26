/**
 * "Try your own move" (owner, 2026-11-16): where the reader is, in the game or in a line of
 * their own that leaves it. Pure: the screen feeds the actions in and draws the result. Only the
 * rules of chess are used here (which moves are legal, what a move is called); what a move is
 * worth is worked out by src/analysis.
 *
 * A line is never saved: it lives in the screen's state and is gone when the screen is left.
 */
import { Chess, type Square } from 'chess.js';
import type { Color, GameMove, GameRecord } from '@/contract';
import { positionAt } from '@/ui/model/games';
import { navigate, type NavigationAction, type ReviewNavigation } from './model';

export interface TryLine {
  /** The game position the line leaves from: 0 = the start, N = after N half-moves. */
  from: number;
  /** The line's moves; their `ply` counts on from the game's (the first is `from + 1`). */
  moves: readonly GameMove[];
  /** How many of them are on the board: 1..moves.length. */
  at: number;
}

/** Where the reader is. In a line, `ply` stays at the game position the line left from. */
export interface ReviewPosition extends ReviewNavigation {
  line: TryLine | null;
}

export type ReviewAction =
  | NavigationAction
  /**
   * A move made on the board (or the engine's reply), in UCI: "g4h6", "a7a8q". With `on`, only
   * when the board shows that FEN: a reply found for one position is never played on another.
   */
  | { play: string; on?: string }
  /** Back to the game, at the position the line left from. */
  | 'exit';

/** The FEN on the board. */
function fenOf(game: GameRecord, state: ReviewPosition): string {
  const move = state.line?.moves[state.line.at - 1];
  return move ? move.fenAfter : positionAt(game, state.ply).fen;
}

/** `uci` played in `fen` as a move of the line, or null when it is not legal there. */
export function moveIn(fen: string, uci: string, ply: number): GameMove | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }
  const color: Color = chess.turn() === 'w' ? 'white' : 'black';
  const wanted = uci.toLowerCase();
  // Matched against the legal moves, so a promotion without its piece is no move at all.
  const legal = chess.moves({ verbose: true }).find((candidate) => candidate.lan === wanted);
  if (!legal) return null;
  const played = chess.move(legal.san);
  return {
    ply,
    moveNumber: Math.ceil(ply / 2),
    color,
    san: played.san,
    uci: wanted,
    fenBefore: fen,
    fenAfter: chess.fen(),
    clockSeconds: null,
    spentSeconds: null,
  };
}

export function reviewNavigate(
  state: ReviewPosition,
  action: ReviewAction,
  game: GameRecord,
): ReviewPosition {
  const lastPly = game.moves.length;
  const { line } = state;

  if (action === 'exit') return line ? { ...state, line: null, stepped: false } : state;
  if (action === 'flip') return { ...navigate(state, action, lastPly), line };

  if (typeof action === 'object' && 'play' in action) {
    const uci = action.play.toLowerCase();
    if (action.on !== undefined && action.on !== fenOf(game, state)) return state;
    if (!line) {
      // The game's own move: a step along the game, not a line.
      if (game.moves[state.ply]?.uci === uci) return { ...navigate(state, 'next', lastPly), line };
      const move = moveIn(fenOf(game, state), uci, state.ply + 1);
      if (!move) return state;
      return { ...state, stepped: true, line: { from: state.ply, moves: [move], at: 1 } };
    }
    // The next move of the line again: a step along the line, the rest of it kept.
    if (line.moves[line.at]?.uci === uci) {
      return { ...state, stepped: true, line: { ...line, at: line.at + 1 } };
    }
    const move = moveIn(fenOf(game, state), uci, line.from + line.at + 1);
    if (!move) return state;
    return {
      ...state,
      stepped: true,
      line: { ...line, moves: [...line.moves.slice(0, line.at), move], at: line.at + 1 },
    };
  }

  if (!line) return { ...navigate(state, action, lastPly), line };

  if (action === 'previous') {
    // Back past the first move of the line: the game again, where it was left.
    if (line.at <= 1) return { ...state, line: null, stepped: false };
    return { ...state, stepped: false, line: { ...line, at: line.at - 1 } };
  }
  if (action === 'next') {
    // At the end of the line the screen plays the engine's best reply (it knows the evaluation).
    if (line.at >= line.moves.length) return state;
    return { ...state, stepped: true, line: { ...line, at: line.at + 1 } };
  }
  // First, last, or a move of the game picked in a list or on the graph: the game again.
  return { ...navigate(state, action, lastPly), line: null };
}

/** What the board shows: the position, the move that led to it, and whose turn it is. */
export function boardPosition(
  game: GameRecord,
  state: ReviewPosition,
): { fen: string; lastMove: string | null; turn: Color } {
  const move = state.line?.moves[state.line.at - 1];
  const { fen, lastMove } = move
    ? { fen: move.fenAfter, lastMove: move.uci }
    : positionAt(game, state.ply);
  return { fen, lastMove, turn: fen.split(' ')[1] === 'b' ? 'black' : 'white' };
}

/** Every legal move of the side to move, as the board wants them: from-square → to-squares. */
export function legalDests(fen: string): Map<string, string[]> {
  const dests = new Map<string, string[]>();
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return dests;
  }
  for (const move of chess.moves({ verbose: true })) {
    const list = dests.get(move.from);
    if (!list) dests.set(move.from, [move.to]);
    else if (!list.includes(move.to)) list.push(move.to);
  }
  return dests;
}

/** True when moving the piece on `from` to `to` is a pawn reaching the last row. */
export function promotes(fen: string, from: string, to: string): boolean {
  try {
    const piece = new Chess(fen).get(from as Square);
    return piece?.type === 'p' && (to[1] === '8' || to[1] === '1');
  } catch {
    return false;
  }
}
