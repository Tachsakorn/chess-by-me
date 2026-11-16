import type { GameRecord } from '@/contract';
import { local } from '@/data/local';
import { useApp } from './appStore';

/**
 * Games of other players listed in Search, held in memory only (Fable review A6-02): a game is
 * saved on the device only when the user opens it, so looking up a busy player does not store
 * a whole month of games. Lost when the app closes, which is fine: Search fetches them again.
 */
const viewed = new Map<string, GameRecord>();

export function rememberViewed(games: readonly GameRecord[]): void {
  viewed.clear();
  for (const game of games) viewed.set(game.id, game);
}

/**
 * Saves a game the user is about to open. Kept in memory as well, so the review still opens
 * when the device cannot save it (a full device; the app shows a note, Fable review A6-01).
 */
export async function saveOpened(game: GameRecord): Promise<void> {
  viewed.set(game.id, game);
  await local.putGames([game], null).catch(() => {});
  // My Games › Others lists it, the one opened last first.
  void useApp.getState().reloadOtherGames();
}

export function viewedGame(id: string): GameRecord | null {
  return viewed.get(id) ?? null;
}
