/**
 * The games in the analysis queue (running and waiting), for the store that deletes old games:
 * a game in the queue must never be deleted under it (Fable review A6-02). The queue writes here
 * on every change; the app store reads. Neither imports the other through this file, so there is
 * no import cycle and no dynamic import.
 */
let queued: ReadonlySet<string> = new Set();

export function setQueuedGames(running: string | null, waiting: readonly string[]): void {
  queued = new Set(running ? [running, ...waiting] : waiting);
}

export function queuedGames(): ReadonlySet<string> {
  return queued;
}
