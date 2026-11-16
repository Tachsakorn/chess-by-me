// Public surface of the engine package. Everything here is safe to load in a
// browser; the Node-only test helper in ./testing is deliberately not exported.

export { parseBestMove, parseInfo, type UciInfo, type UciScore } from './uci';
export { toWhiteScore } from './score';
export { ENGINE_FILES, ENGINE_VERSION, engineScriptUrl } from './engineFiles';
export { EngineError } from './errors';
export { createWorkerTransport, type EngineTransport } from './transport';
export { UciEngine, type RawEval } from './uciEngine';
export { CLOUD_EVAL_URL, fetchCloudEval, type CloudEvalOptions, type WhiteEval } from './cloudEval';
export { evaluateGame, evaluatePosition, type EvaluateGameDeps } from './evaluateGame';
