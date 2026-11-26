/**
 * Game dates (1.1.1, Fable review 1.1 B4-04). A game's `playedAt` is an ISO 8601 UTC time or null
 * ("no date"). Old game collections write "day unknown" as `2024.00.00`, and pasted text can hold
 * any date at all: those must be stored as no date, because a date the browser cannot read made
 * the lists of My Games fail for good.
 */

/** `playedAt` if it is a real moment ("2024-02-29T10:00:00Z"), else null. */
export function validPlayedAt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const time = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(time);
  // Date.UTC rolls an impossible day over (2023-02-30 becomes 2023-03-02): check it did not.
  const real =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second;
  return real ? value : null;
}

/** The game with an impossible date replaced by no date; the same object when nothing changes. */
export function withValidDate<T extends { playedAt: string | null }>(game: T): T {
  const playedAt = validPlayedAt(game.playedAt);
  return playedAt === game.playedAt ? game : { ...game, playedAt };
}
