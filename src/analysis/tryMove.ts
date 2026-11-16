/**
 * Reviews the moves a reader tries on the review board ("try your own move", owner, 2026-11-16):
 * a line that leaves the analysed game at some position and goes its own way.
 *
 * Nothing here is a new rule. The line is laid end to end with the game it left (the game's moves
 * and evaluations up to the position it leaves from, then the line's own) and each of its moves
 * goes through `reviewMove`, the function that labels the moves of the game. So the first move
 * of a line is measured against the game analysis's evaluation of the position before it, and
 * every later move against the line's own evaluation.
 *
 * Book: a tried move is a book move when the position it reaches is in the opening book (the
 * same book, looked up by position). The label of a move never depends on what is tried after
 * it, so a label once shown stays.
 */
import type {
  Color,
  GameMove,
  GameRecord,
  MoveReview,
  OpeningInfo,
  PositionEval,
} from '@/contract';
import { reviewMove } from './buildAnalysis';
import { findOpening, moveInputAt, type OpeningBook } from './classify';
import { ERROR_MIN_LOSS } from './classify/classifyGame';
import { expectedPointsFor } from './classify/expectedPoints';

export interface TriedLine {
  /** The game the line leaves, with the positions and the opening of its finished analysis. */
  game: GameRecord;
  positions: readonly PositionEval[];
  opening: OpeningInfo | null;
  /** The game position the line starts from: 0 = the start, N = after N half-moves. */
  from: number;
  /** The line's moves; their `ply` counts on from the game's. */
  moves: readonly GameMove[];
  /** The evaluation of the position after each move of the line; undefined until known. */
  evals: readonly (PositionEval | undefined)[];
}

/**
 * The review of the line's move `index` (0 = the first), or null until the positions on both
 * sides of it are evaluated. The accuracy is the move's own, as in the game.
 */
export function reviewTriedMove(
  line: TriedLine,
  index: number,
  book: OpeningBook,
): MoveReview | null {
  const { game, from } = line;
  if (index < 0 || index >= line.moves.length) return null;
  const moves = [...game.moves.slice(0, from), ...line.moves.slice(0, index + 1)];
  const positions: (PositionEval | undefined)[] = [
    ...line.positions.slice(0, from + 1),
    ...line.evals.slice(0, index + 1),
  ];

  // The last book ply as this move sees it: the game's own up to where the line leaves it, then
  // every line move that reaches a book position.
  let lastBookPly = Math.min(line.opening?.lastBookPly ?? 0, from);
  for (let i = 0; i <= index; i += 1) {
    const move = line.moves[i];
    if (move && findOpening(book, [move.fenAfter])) lastBookPly = from + i + 1;
  }

  // moveInputAt reads only the positions around the move and gives null while one is missing.
  const input = moveInputAt(
    { ...game, moves },
    positions as readonly PositionEval[],
    from + index,
    lastBookPly,
  );
  return input ? reviewMove(input) : null;
}

/**
 * How the first move of the line did against the move played in the game from the same
 * position: by what the mover can expect afterwards. "Same" within the 1% that the labels treat
 * as nothing lost. Null until the tried move is evaluated, or when the game has no move there.
 */
export function compareWithGameMove(line: TriedLine): 'better' | 'same' | 'worse' | null {
  const tried = line.evals[0];
  const first = line.moves[0];
  const played = line.game.moves[line.from];
  const gameAfter = line.positions[line.from + 1];
  if (!tried || !first || !played || !gameAfter) return null;
  const mover: Color = first.color;
  const difference =
    expectedPointsFor(tried.score, mover) - expectedPointsFor(gameAfter.score, mover);
  if (Math.abs(difference) < ERROR_MIN_LOSS) return 'same';
  return difference > 0 ? 'better' : 'worse';
}
