/**
 * Puts the pieces together: a game and its evaluated positions become the
 * contract's `GameAnalysis`. Pure; the engine is not involved here, so the
 * same code serves the live analysis, the tests and the fixture builder.
 */
import {
  CONTRACT_VERSION,
  emptyCounts,
  validateGameAnalysis,
  type Color,
  type EngineInfo,
  type GameAnalysis,
  type GameRecord,
  type MoveReview,
  type OpeningInfo,
  type PlayerSummary,
  type PositionEval,
} from '@/contract';
import { computeAccuracy, moveAccuracy, winPercent } from './accuracy';
import {
  RULES_VERSION,
  classifyGame,
  classifyMove,
  type ClassifyMoveInput,
  type MoveClassification,
} from './classify';
import { estimateRating } from './rating';

function withAccuracy(classification: MoveClassification, accuracy: number): MoveReview {
  return {
    ply: classification.ply,
    category: classification.category,
    pointLoss: classification.pointLoss,
    accuracy,
    playedIsBest: classification.playedIsBest,
    best: classification.best,
    tags: classification.tags,
  };
}

/**
 * The review of one move, as soon as the positions on both sides of it are
 * known: its category and tags, and its accuracy. Gives the same result as
 * the matching entry of `buildAnalysis(...).moves`.
 */
export function reviewMove(input: ClassifyMoveInput): MoveReview {
  const whiteBefore = winPercent(input.before.score);
  const whiteAfter = winPercent(input.after.score);
  const accuracy =
    input.move.color === 'white'
      ? moveAccuracy(whiteBefore, whiteAfter)
      : moveAccuracy(100 - whiteBefore, 100 - whiteAfter);
  return withAccuracy(classifyMove(input), accuracy);
}

export interface BuildAnalysisInput {
  game: GameRecord;
  /** One per position: the start and the position after each move. */
  positions: readonly PositionEval[];
  opening: OpeningInfo | null;
  engine: EngineInfo;
  /** ISO 8601 UTC time the analysis finished. */
  createdAt: string;
}

/**
 * The whole analysis of a game. Throws when the positions do not belong to
 * the game or the result does not fit the contract; nothing that fails the
 * contract's validator leaves this function.
 */
export function buildAnalysis(input: BuildAnalysisInput): GameAnalysis {
  const { game, positions, opening, engine, createdAt } = input;
  const colors = game.moves.map((move) => move.color);
  const accuracy = computeAccuracy(positions, colors);
  const moves = classifyGame({ game, positions, opening }).map((classification, index) =>
    withAccuracy(classification, accuracy.perMove[index] ?? 0),
  );

  const summary = (color: Color, gameAccuracy: number): PlayerSummary => {
    const counts = emptyCounts();
    let playerMoves = 0;
    moves.forEach((review, index) => {
      if (colors[index] !== color) return;
      counts[review.category] += 1;
      playerMoves += 1;
    });
    return {
      accuracy: gameAccuracy,
      estimatedRating: estimateRating({
        accuracy: gameAccuracy,
        timeClass: game.timeControl?.timeClass ?? null,
        playerMoves,
      }),
      counts,
    };
  };

  // Book moves labelled as the errors they are (owner, 2026-11-15, Fable review A1-05). The
  // field is left out when there are none, so such analyses look exactly as before.
  const errorPlies = opening
    ? moves
        .filter((review) => review.ply <= opening.lastBookPly && review.category !== 'book')
        .map((review) => review.ply)
    : [];
  const analysis: GameAnalysis = {
    contractVersion: CONTRACT_VERSION,
    gameId: game.id,
    createdAt,
    engine,
    opening: opening && errorPlies.length > 0 ? { ...opening, errorPlies } : opening,
    positions: [...positions],
    moves,
    white: summary('white', accuracy.white),
    black: summary('black', accuracy.black),
    rulesVersion: RULES_VERSION,
  };

  const problems = validateGameAnalysis(analysis, game);
  if (problems.length > 0) {
    throw new Error(`the analysis does not fit the contract: ${problems.slice(0, 5).join('; ')}`);
  }
  return analysis;
}
