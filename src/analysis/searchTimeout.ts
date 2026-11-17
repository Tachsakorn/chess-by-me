/**
 * How long one search may take before the engine counts as dead, by search depth (owner, 1.1
 * round 2). A deeper search takes longer: on this project's measurements every 2 plies of depth
 * about double the time (docs/reports, 1.1 round 1), so 20 and 22 get twice and four times the
 * 120 s that depth 18 always had. The one table of these numbers: the game analysis
 * (analyzeGame.ts) and "try your own move" (positionEvaluator.ts) both read it.
 */
const LIMITS: readonly { upToDepth: number; ms: number }[] = [
  { upToDepth: 18, ms: 120_000 },
  { upToDepth: 20, ms: 240_000 },
  { upToDepth: Infinity, ms: 480_000 },
];

/** The time limit of one search to `depth`. */
export function searchTimeoutMs(depth: number): number {
  return (LIMITS.find((limit) => depth <= limit.upToDepth) ?? LIMITS[LIMITS.length - 1]!).ms;
}
