import type { AnalysisOptions } from '@/contract';

/**
 * The analysis setting of the app (owner, 2026-11-14): Stockfish 17.1 lite,
 * depth 18, no Lichess cloud eval, the same on every device. The measurements
 * behind it are in docs/BENCHMARKS.md. Since 1.1 the user may pick another depth
 * in Settings (14 to 22, src/ui/app/analysisDepth.ts); 18 stays the default.
 */
export const APP_ANALYSIS_OPTIONS: AnalysisOptions = Object.freeze({
  engine: 'lite',
  depth: 18,
  useCloudEval: false,
});
