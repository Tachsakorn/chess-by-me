/**
 * A saved analysis made under older labelling rules, brought up to the current rules from its own
 * evaluations (1.1.1, Fable review 1.1 B2-01). The rules only decide the labels; the engine's
 * evaluation of every position and the opening are already saved with the analysis, so no engine,
 * no opening book and no network are needed.
 */
import type { GameAnalysis, GameRecord, OpeningInfo } from '@/contract';
import { buildAnalysis } from './buildAnalysis';

/**
 * The analysis under the current rules, or null when the saved one cannot be rebuilt: positions
 * missing (a review shorter than its game, Fable review 1.1 B4-08), or data that no longer fits
 * the game or the contract. The caller then runs the engine as before.
 */
export function rebuildAnalysis(game: GameRecord, stored: GameAnalysis): GameAnalysis | null {
  if (stored.gameId !== game.id) return null;
  if (!Array.isArray(stored.positions) || stored.positions.length !== game.moves.length + 1) {
    return null;
  }
  if (stored.positions.some((position) => !position)) return null;
  // The book moves played as errors are worked out again from the labels.
  const opening: OpeningInfo | null = stored.opening
    ? {
        eco: stored.opening.eco,
        name: stored.opening.name,
        lastBookPly: stored.opening.lastBookPly,
      }
    : null;
  try {
    return buildAnalysis({
      game,
      positions: stored.positions,
      opening,
      engine: stored.engine,
      createdAt: stored.createdAt,
    });
  } catch {
    return null;
  }
}
