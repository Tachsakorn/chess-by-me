/** Addresses of screens that carry an id. Game ids hold a colon ("lichess:abc"), so encode. */
export function reviewPath(gameId: string): string {
  return `/review/${encodeURIComponent(gameId)}`;
}
