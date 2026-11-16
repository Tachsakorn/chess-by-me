import type { AnalysisOptions } from '@/contract';

/**
 * The one analysis setting of the app (owner, 2026-11-14): Stockfish 17.1 lite,
 * depth 18, no Lichess cloud eval, the same on every device and not offered to
 * the user. The measurements behind it are in docs/BENCHMARKS.md.
 */
export const APP_ANALYSIS_OPTIONS: AnalysisOptions = Object.freeze({
  engine: 'lite',
  depth: 18,
  useCloudEval: false,
});
