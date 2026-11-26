/**
 * The saved analysis of a game, under the current labelling rules (1.1.1, Fable review 1.1
 * B2-01). One made under older rules is rebuilt from its own evaluations, saved, and returned at
 * once: no engine, no opening book, no network, so it opens offline too. Null when there is none,
 * or when the saved one cannot be rebuilt (positions missing): the review screen then runs the
 * engine as before.
 */
import { isCurrentAnalysis, rebuildAnalysis } from '@/analysis';
import type { GameAnalysis, GameRecord } from '@/contract';
import { local } from '@/data/local';
import { useApp } from './appStore';

export async function loadCurrentAnalysis(game: GameRecord): Promise<GameAnalysis | null> {
  const stored = await local.getAnalysis(game.id);
  if (!stored) return null;
  if (isCurrentAnalysis(stored)) return stored;
  const rebuilt = rebuildAnalysis(game, stored);
  if (!rebuilt) return null;
  // Shown even if it cannot be saved (a full device: the app's note says so); it is rebuilt again
  // next time, which costs a fraction of a second.
  await local.putAnalysis(rebuilt, game).catch(() => {});
  useApp.getState().addSummary({
    gameId: game.id,
    white: rebuilt.white.accuracy,
    black: rebuilt.black.accuracy,
  });
  return rebuilt;
}
