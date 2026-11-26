import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENGINE_HASH_MB, MULTI_PV } from '../analyzeGame';
import { createNodeTransport } from './testing/nodeTransport';
import { UciEngine, type RawEval } from './uciEngine';
import {
  SNAPSHOT_DEPTH,
  searchLikeTheApp,
  snapshotFens,
  snapshotFile,
  type EngineSnapshot,
} from './testing/engineSnapshot';

// The real engine on every position of a real game gives, depth by depth and line by line,
// exactly what it gave before the analysis board changed the engine code (recorded 2026-11-26 in
// fixtures/lichess-LAGvRNey/engine-raw-lite.json). The game analysis and the labels of tried
// moves come from this search, so they are unchanged too.
describe('the plain engine search', () => {
  it('gives exactly the recorded output on every position of lichess-LAGvRNey', async () => {
    const recorded = JSON.parse(readFileSync(snapshotFile(), 'utf8')) as EngineSnapshot;
    expect(recorded.depth).toBe(SNAPSHOT_DEPTH);
    expect(recorded.multiPv).toBe(MULTI_PV);
    expect(recorded.hashMb).toBe(ENGINE_HASH_MB);
    expect(recorded.positions.map((position) => position.fen)).toEqual(snapshotFens());
    expect(recorded.positions).toHaveLength(85);

    const now = await searchLikeTheApp(snapshotFens());
    expect(now).toEqual(recorded.positions);
  }, 300_000);

  it('with a time limit and progress, stops in time and reports deeper and deeper results', async () => {
    const engine = new UciEngine(createNodeTransport('lite'));
    try {
      await engine.start({ multiPv: 3, hashMb: ENGINE_HASH_MB });
      const seen: RawEval[] = [];
      const started = Date.now();
      // Depth 60 is never reached in 400 ms: the time stops the search.
      const result = await engine.evaluate(snapshotFens()[20]!, 60, undefined, {
        movetimeMs: 400,
        onProgress: (soFar) => seen.push(soFar),
      });
      expect(Date.now() - started).toBeLessThan(3_000);
      expect(seen.length).toBeGreaterThan(3);
      expect(seen.map((s) => s.depth)).toEqual([...seen.map((s) => s.depth)].sort((a, b) => a - b));
      for (const soFar of seen) expect(soFar.lines).toHaveLength(3);
      expect(result.depth).toBeGreaterThanOrEqual(seen.at(-1)!.depth);
      expect(result.depth).toBeLessThan(60);
    } finally {
      engine.close();
    }
  }, 60_000);
});
