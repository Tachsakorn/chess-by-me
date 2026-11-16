/**
 * Builds a development fixture (a real game and its analysis) with the real
 * analysis code: the same `analyzeGame` the app uses, with Stockfish run by Node.
 *
 * Run: npm run fixture:make          (PowerShell: set the variables with $env:NAME = '...')
 *
 * Environment variables:
 * - FIXTURE          folder under fixtures/ (required), for example lichess-LAGvRNey
 * - FIXTURE_FROM     fetch the game first: "lichess:<user>:<game id>" or
 *                    "chesscom:<user>:<game uuid>"; writes game.pgn and game.json
 * - REUSE_POSITIONS  "1" keeps the engine evaluations of the existing analysis.json
 *                    and only rebuilds everything derived from them
 * - FIXTURE_ENGINE   "full" (default) or "lite";  FIXTURE_DEPTH  default 18
 *
 * Two analyses per game (owner, 2026-11-15): "full" writes analysis.json and fixture.json, which
 * the tests of src/analysis read; "lite" (what the app runs: lite, depth 18) writes
 * analysis-lite.json and fixture-lite.json, which the screens, dev pages and UI tests read.
 *
 * Without FIXTURE_FROM the game comes from the folder: game.pgn plus the known
 * facts in source.json (id, source, sourceUrl, ...) when that file exists,
 * otherwise the existing game.json as it is.
 *
 * Writes game.json, the analysis and how it was made (see the two names above).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import type { EngineVariant, GameAnalysis, GameRecord, PositionEval } from '@/contract';
import { createAnalyzeGame } from '@/analysis/analyzeGame';
import { buildAnalysis } from '@/analysis/buildAnalysis';
import { expectedPoints, findOpening, loadOpeningBook } from '@/analysis/classify';
import { UciEngine } from '@/analysis/engine';
import { createNodeTransport } from '@/analysis/engine/testing/nodeTransport';
import { importGames } from '@/data';
import { gameFromPgn, type KnownGameFacts } from '@/data/pgn';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const save = (file: string, value: unknown) =>
  writeFileSync(file, JSON.stringify(value, null, 1) + '\n');
const load = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

async function fetchGame(from: string): Promise<GameRecord> {
  const [source, username, id] = from.split(':');
  if ((source !== 'lichess' && source !== 'chesscom') || !username || !id) {
    throw new Error(`FIXTURE_FROM must be "lichess:<user>:<id>" or "chesscom:<user>:<uuid>"`);
  }
  const result = await importGames({ source, username });
  if (!result.ok) throw new Error(`import failed: ${result.error.code} ${result.error.detail}`);
  const game = result.games.find((g) => g.id === `${source}:${id}`);
  if (!game) throw new Error(`${source}:${id} is not among ${username}'s newest games`);
  return game;
}

function analyse(game: GameRecord, variant: EngineVariant, depth: number): Promise<GameAnalysis> {
  const analyzeGame = createAnalyzeGame({
    createEngine: (v) => new UciEngine(createNodeTransport(v)),
    loadOpeningBook,
  });
  return new Promise((resolve, reject) => {
    analyzeGame(game, { engine: variant, depth, useCloudEval: false }, (event) => {
      if (event.type === 'completed') resolve(event.analysis);
      if (event.type === 'failed') {
        reject(new Error(`analysis failed: ${event.error.code} ${event.error.detail}`));
      }
    });
  });
}

it('runs', async () => {
  const name = process.env.FIXTURE;
  if (!name) throw new Error('set FIXTURE to a folder name under fixtures/');
  const dir = join(ROOT, 'fixtures', name);
  mkdirSync(dir, { recursive: true });
  const file = (f: string) => join(dir, f);

  let game: GameRecord;
  let gameFrom: string;
  if (process.env.FIXTURE_FROM) {
    game = await fetchGame(process.env.FIXTURE_FROM);
    writeFileSync(file('game.pgn'), game.pgn);
    gameFrom = `fetched with importGames (${process.env.FIXTURE_FROM})`;
  } else if (existsSync(file('source.json'))) {
    const parsed = gameFromPgn(
      readFileSync(file('game.pgn'), 'utf8'),
      load<KnownGameFacts>(file('source.json')),
    );
    if (!parsed) throw new Error('game.pgn could not be read as a standard game');
    game = parsed;
    gameFrom = 'game.pgn read with gameFromPgn, known facts from source.json';
  } else {
    game = load<GameRecord>(file('game.json'));
    gameFrom = 'existing game.json';
  }
  save(file('game.json'), game);

  const variant: EngineVariant = process.env.FIXTURE_ENGINE === 'lite' ? 'lite' : 'full';
  const depth = Number(process.env.FIXTURE_DEPTH ?? 18);
  const suffix = variant === 'lite' ? '-lite' : '';
  const analysisFile = file(`analysis${suffix}.json`);
  const fixtureFile = file(`fixture${suffix}.json`);
  const previous = existsSync(fixtureFile) ? load<Record<string, unknown>>(fixtureFile) : {};
  let analysis: GameAnalysis;
  let evaluations: Record<string, unknown>;

  if (process.env.REUSE_POSITIONS === '1') {
    const old = load<GameAnalysis>(analysisFile);
    // The engine's verdicts are kept; expected points are recomputed from them in full precision.
    const positions: PositionEval[] = old.positions.map((p) => ({
      ...p,
      whiteExpected: expectedPoints(p.score),
    }));
    const opening = findOpening(
      await loadOpeningBook(),
      game.moves.map((m) => m.fenAfter),
    );
    analysis = buildAnalysis({
      game,
      positions,
      opening,
      engine: old.engine,
      createdAt: old.createdAt,
    });
    evaluations = (previous.evaluations as Record<string, unknown> | undefined) ?? {
      note: 'kept from the analysis.json that was here before',
    };
  } else {
    const started = Date.now();
    analysis = await analyse(game, variant, depth);
    evaluations = {
      engine: analysis.engine,
      cloudEval: false,
      runBy: 'Node (child process), one engine process',
      seconds: Math.round((Date.now() - started) / 1000),
      machine: `${(cpus()[0]?.model ?? 'unknown CPU').trim()}, ${cpus().length} logical cores`,
      evaluatedAt: analysis.createdAt,
    };
  }

  save(analysisFile, analysis);
  save(fixtureFile, {
    note: 'Development fixture: a real game analysed by the real analysis code. Not product data.',
    game: gameFrom,
    evaluations,
    derived:
      'opening, move categories, accuracy and rating ranges built by buildAnalysis (src/analysis)',
    builtAt: new Date().toISOString(),
  });
});
