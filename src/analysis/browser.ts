/**
 * BROWSER ONLY: `analyzeGame` wired to the real engine in a Web Worker and to
 * the opening book. This is what the screens call. The engine scripts are
 * served from `engines/` under the app's base URL (see scripts/copy-engines.mjs).
 *
 * The lite engine's WebAssembly file (about 7 MB) is downloaded here first, with progress, and
 * handed to the worker as a blob address after `#`, which the stockfish.js worker reads as the
 * place of its .wasm (Fable review A8-01). The engine's 30-second start limit then counts only
 * once the file is here, and a retry or the next game uses the same copy instead of downloading
 * it again. The full engine (split in parts) still loads itself.
 */
import type { AnalyzeGame, EngineVariant } from '@/contract';
import { createAnalyzeGame } from './analyzeGame';
import { loadOpeningBook } from './classify';
import { createWorkerTransport, engineScriptUrl, UciEngine } from './engine';
import { engineCount } from './engineCount';
import { createPositionEvaluator, type PositionEvaluator } from './positionEvaluator';
import { createLiveEvaluator, type LiveEvaluator } from './liveEvaluator';
import { APP_ANALYSIS_OPTIONS } from './settings';

const base = `${import.meta.env.BASE_URL}engines/`;

/** A download that receives nothing for this long is given up; the user can try again. */
const STALL_MS = 60_000;

type Progress = (loadedBytes: number, totalBytes: number | null, cached?: boolean) => void;

/**
 * True when the service worker has the file stored on this device (public/sw.js keeps the engine
 * in its own cache), so getting it is not a download (1.1.1: "Loading the engine…", not
 * "Downloading the engine… N%").
 */
async function storedOnDevice(url: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    return (await caches.match(url)) !== undefined;
  } catch {
    return false;
  }
}

/** The downloaded lite engine as a blob address: one download per session. */
let liteWasm: Promise<string> | null = null;
/** Everyone waiting for that download, told of its progress. */
const watchers = new Set<Progress>();

async function download(url: string): Promise<string> {
  const cached = await storedOnDevice(url);
  const controller = new AbortController();
  let stall = setTimeout(() => controller.abort(), STALL_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const header = Number(res.headers.get('content-length'));
    const total = Number.isFinite(header) && header > 0 ? header : null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(stall);
      stall = setTimeout(() => controller.abort(), STALL_MS);
      chunks.push(value);
      loaded += value.byteLength;
      for (const watch of watchers) watch(loaded, total, cached);
    }
    return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: 'application/wasm' }));
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`no data for ${STALL_MS / 1000} seconds`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(stall);
  }
}

/** The worker script of each variant, once its files are ready. */
const scripts: Record<EngineVariant, string> = {
  lite: engineScriptUrl('lite', base),
  full: engineScriptUrl('full', base),
};

async function prepareEngine(variant: EngineVariant, progress: Progress): Promise<void> {
  if (variant !== 'lite') return;
  watchers.add(progress);
  try {
    liteWasm ??= download(scripts.lite.replace(/\.js$/, '.wasm')).catch((error: unknown) => {
      liteWasm = null; // the next try downloads again
      throw error;
    });
    const wasm = await liteWasm;
    scripts.lite = `${engineScriptUrl('lite', base)}#${encodeURIComponent(wasm)}`;
  } finally {
    watchers.delete(progress);
  }
}

const onResume = (listener: () => void) => {
  const onChange = () => {
    if (document.visibilityState === 'visible') listener();
  };
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};

/**
 * The evaluator behind "try your own move" on the review screen (owner, 2026-11-16): one engine
 * of the app's own kind and settings (APP_ANALYSIS_OPTIONS), made when the first move is tried
 * and closed by the screen when it is left. It searches to `depth`, the depth the game itself was
 * analysed at (1.1: the depth is picked in Settings), so a tried move and the game move are
 * judged alike.
 */
export function createTryEvaluator(
  onChange: () => void,
  depth: number = APP_ANALYSIS_OPTIONS.depth,
): PositionEvaluator {
  return createPositionEvaluator(
    {
      prepareEngine,
      createEngine: (variant) => new UciEngine(createWorkerTransport(scripts[variant])),
      onResume,
    },
    { ...APP_ANALYSIS_OPTIONS, depth },
    onChange,
  );
}

/**
 * The engine lines of the analysis board (2026-11-26): one engine of the app's own kind showing
 * three lines, each position searched to `depth` or for `movetimeMs`, whichever comes first.
 */
export function createLiveBoardEvaluator(
  onChange: () => void,
  depth: number,
  movetimeMs: number,
): LiveEvaluator {
  return createLiveEvaluator(
    {
      prepareEngine,
      createEngine: (variant) => new UciEngine(createWorkerTransport(scripts[variant])),
    },
    { engine: APP_ANALYSIS_OPTIONS.engine, depth, movetimeMs },
    onChange,
  );
}

export const analyzeGame: AnalyzeGame = createAnalyzeGame({
  // Chromium reports deviceMemory (GB, rounded down); other browsers leave it out.
  engines: engineCount(
    typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  ),
  prepareEngine,
  createEngine: (variant) => new UciEngine(createWorkerTransport(scripts[variant])),
  loadOpeningBook,
  onResume,
});
