// Public surface of the analysis layer. The screens use `analyzeGame`; the
// rest is exported for tests, fixtures and tools that bring their own engine.

export { analyzeGame, createTryEvaluator } from './browser';
export {
  createPositionEvaluator,
  type PositionEvaluator,
  type PositionEvaluatorDeps,
} from './positionEvaluator';
export { compareWithGameMove, reviewTriedMove, type TriedLine } from './tryMove';
export { loadOpeningBook, type OpeningBook } from './classify';
export { createAnalyzeGame, type AnalysisEngine, type AnalyzeGameDeps } from './analyzeGame';
export { buildAnalysis, reviewMove, type BuildAnalysisInput } from './buildAnalysis';
export { APP_ANALYSIS_OPTIONS } from './settings';
export { ENGINE_VERSION } from './engine/engineFiles';
import { RULES_VERSION } from './classify';
export { RULES_VERSION };

/** False for a saved analysis made under older labelling rules: it is to be done again. */
export function isCurrentAnalysis(analysis: { rulesVersion?: number }): boolean {
  return analysis.rulesVersion === RULES_VERSION;
}
