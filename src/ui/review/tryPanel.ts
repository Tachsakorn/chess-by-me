/**
 * What the Move panel says about a move of the reader's own line ("try your own move", owner,
 * 2026-11-16). Like panel.ts, nothing here evaluates chess: it words what src/analysis found.
 */
import type { GameRecord, MoveCategory, MoveReview, PositionEval } from '@/contract';
import { CATEGORY_MARK, moveLabel } from '@/ui/model/games';
import type { AnalysisState } from './analysisState';
import { formatScore } from './model';
import { numberedLine } from './panel';
import type { TryLine } from './tryLine';

export type Comparison = 'better' | 'same' | 'worse';

export type TryText =
  /** The engine is thinking. `gameMove`: "8... d5?", on the first move of the line only. */
  | { kind: 'checking'; label: string; gameMove: string | null }
  /** The engine could not be used. */
  | { kind: 'failed'; label: string }
  | {
      kind: 'result';
      /** "8... Nh6", with its mark once the category is known ("8... Nxf2??"). */
      label: string;
      category: MoveCategory;
      /** "+1.2 → +1.2", White's side. */
      evalText: string | null;
      /** Against the move played in the game: the first move of the line only. */
      compare: { kind: Comparison; gameMove: string } | null;
      /** The engine's answer and one move more: "9. Bxh6 gxh6". Null when the game is over. */
      reply: string | null;
    };

/** Plies of the engine's line written as the best reply. */
const REPLY_PLIES = 2;

export function tryText(input: {
  game: GameRecord;
  /** The finished analysis of the game. */
  state: AnalysisState;
  line: TryLine;
  /** The evaluation after each move of the line; undefined until known. */
  evals: readonly (PositionEval | undefined)[];
  /** The review of the move on the board; null until known. */
  review: MoveReview | null;
  /** How the first move of the line did against the game move; null until known. */
  compare: Comparison | null;
  failed: boolean;
}): TryText {
  const { game, state, line, evals, review, failed } = input;
  const index = line.at - 1;
  const move = line.moves[index]!;
  const number = move.color === 'white' ? `${move.moveNumber}.` : `${move.moveNumber}...`;
  const plain = `${number} ${move.san}`;
  // The move the game has at the place the line left: named for the first move of the line.
  const gameMove =
    index === 0 && game.moves[line.from]
      ? moveLabel(game, line.from + 1, state.reviews[line.from]?.category)
      : null;

  const after = evals[index];
  if (!review || !after) {
    return failed ? { kind: 'failed', label: plain } : { kind: 'checking', label: plain, gameMove };
  }
  const before = index === 0 ? state.positions[line.from] : evals[index - 1];
  const replyLine = after.lines[0]?.san.slice(0, REPLY_PLIES) ?? [];
  return {
    kind: 'result',
    label: `${plain}${CATEGORY_MARK[review.category]}`,
    category: review.category,
    evalText: before ? `${formatScore(before.score)} → ${formatScore(after.score)}` : null,
    compare: gameMove && input.compare ? { kind: input.compare, gameMove } : null,
    reply: replyLine.length > 0 ? numberedLine(move.ply, replyLine) : null,
  };
}
