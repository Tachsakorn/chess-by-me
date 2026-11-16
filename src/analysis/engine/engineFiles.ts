import type { EngineVariant } from '@/contract';

/**
 * The Stockfish builds this app ships, from the `stockfish` npm package 17.1.0
 * (`node_modules/stockfish/src/`). Single-threaded builds only: they run
 * without cross-origin isolation headers. `scripts/copy-engines.mjs` copies
 * them, with their .wasm files, to `public/engines/`.
 */
export const ENGINE_VERSION = '17.1';

export const ENGINE_FILES: Record<EngineVariant, string> = {
  lite: 'stockfish-17.1-lite-single-03e3232.js',
  full: 'stockfish-17.1-single-a496a04.js',
};

/** URL of the engine script for a Web Worker. `baseUrl` may end with a slash or not. */
export function engineScriptUrl(variant: EngineVariant, baseUrl = '/engines/'): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return base + ENGINE_FILES[variant];
}
