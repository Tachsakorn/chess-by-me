/**
 * How many games the device keeps for each connected account (Fable review A6-02).
 *
 * 200 because: one update brings at most 50 Lichess games or one to two Chess.com months (a busy
 * player's month can be a few hundred); My Games shows 20 at a time; a game takes 25-31 kB, so
 * 200 is about 6 MB per account; and the app reads all of an account's games when it opens, so
 * the list must stay small enough to read quickly on a phone. Analysed games are kept beyond
 * this: the user asked for them, and their analysis took minutes.
 */
export const KEEP_PER_ACCOUNT = 200;

export interface KeptGame {
  id: string;
  /** ISO time; null when the game has no date (it counts as the oldest). */
  playedAt: string | null;
}

/**
 * The games to delete so that at most `keep` remain besides the analysed ones: the oldest
 * unanalysed games. An analysed game is never named and does not take a place.
 */
export function gamesToDrop(
  rows: readonly KeptGame[],
  analysed: ReadonlySet<string>,
  keep: number,
): string[] {
  const candidates = rows
    .filter((row) => !analysed.has(row.id))
    .sort((a, b) => (b.playedAt ?? '').localeCompare(a.playedAt ?? '') || a.id.localeCompare(b.id));
  return candidates.slice(keep).map((row) => row.id);
}
