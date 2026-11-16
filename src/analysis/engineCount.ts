/**
 * How many engines analyse a game at once (speed round, owner 2026-11-15): one per processor core
 * but one, at most four, at least one. Single-threaded engines only: a multi-threaded Stockfish
 * does not give the same result twice.
 *
 * Each engine holds about 60 MB (Stockfish 17.1 lite's WebAssembly memory, the same whatever its
 * hash; measured in Node, docs/BENCHMARKS.md). On a device that reports 2 GB of memory or less
 * (`navigator.deviceMemory`, Chrome only) at most two run.
 */
export const MAX_ENGINES = 4;
export const LOW_MEMORY_GB = 2;
export const LOW_MEMORY_MAX_ENGINES = 2;

export function engineCount(cores: number | undefined, memoryGb?: number): number {
  const byCores = Math.min(MAX_ENGINES, Math.max(1, Math.floor((cores ?? 2) - 1)));
  if (memoryGb !== undefined && memoryGb <= LOW_MEMORY_GB) {
    return Math.min(byCores, LOW_MEMORY_MAX_ENGINES);
  }
  return byCores;
}
