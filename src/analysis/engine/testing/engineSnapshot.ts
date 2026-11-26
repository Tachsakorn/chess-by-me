// NODE ONLY. Only test files and scripts/ may import this (it starts Stockfish through Node).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GameRecord } from '@/contract';
import { ENGINE_HASH_MB, MULTI_PV } from '../../analyzeGame';
import { UciEngine, type RawEval } from '../uciEngine';
import { createNodeTransport } from './nodeTransport';

/**
 * The raw engine output of every position of one real game, searched the way the app searches a
 * position for the game analysis and for a tried move: Stockfish lite, `MULTI_PV` lines, the
 * app's hash, a cleared engine (`ucinewgame`) before each position, `go depth <depth>`.
 *
 * Recorded before the engine gained time-limited and progress-reporting searches (the analysis
 * board, 2026-11-26) so that a test can prove the plain search still gives exactly this.
 */
export interface EngineSnapshot {
  game: string;
  engine: 'lite';
  depth: number;
  multiPv: number;
  hashMb: number;
  positions: Array<{ fen: string; raw: RawEval }>;
}

export const SNAPSHOT_GAME = 'lichess-LAGvRNey';
export const SNAPSHOT_DEPTH = 18;

export const snapshotFile = (): string =>
  fileURLToPath(
    new URL(`../../../../fixtures/${SNAPSHOT_GAME}/engine-raw-lite.json`, import.meta.url),
  );

/** The positions of the snapshot game that have a move to search (every position before a move). */
export function snapshotFens(): string[] {
  const game = JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../../fixtures/${SNAPSHOT_GAME}/game.json`, import.meta.url)),
      'utf8',
    ),
  ) as GameRecord;
  return game.moves.map((move) => move.fenBefore);
}

/** Searches `fens` one by one as the app does and returns the raw results, in order. */
export async function searchLikeTheApp(
  fens: readonly string[],
  depth: number = SNAPSHOT_DEPTH,
): Promise<EngineSnapshot['positions']> {
  const engine = new UciEngine(createNodeTransport('lite'));
  try {
    await engine.start({ multiPv: MULTI_PV, hashMb: ENGINE_HASH_MB });
    const positions: EngineSnapshot['positions'] = [];
    for (const fen of fens) {
      engine.newGame();
      positions.push({ fen, raw: await engine.evaluate(fen, depth) });
    }
    return positions;
  } finally {
    engine.close();
  }
}
