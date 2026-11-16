import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateGameAnalysis, type GameAnalysis, type GameRecord, type Score } from '@/contract';
import { EngineError } from './errors';
import { evaluateGame } from './evaluateGame';
import { createNodeTransport } from './testing/nodeTransport';
import { UciEngine } from './uciEngine';

// The real Stockfish 17.1 lite build, run as a child process. Nothing here is
// scripted: every assertion is about what the engine itself answers.
const TIMEOUT_MS = 60_000;
const DEPTH = 10;
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// A real game: EricRosen vs ni5hu, 85 half-moves, White mates (see fixtures/lichess-LAGvRNey).
const fixtureFile = (name: string) =>
  readFileSync(new URL(`../../../fixtures/lichess-LAGvRNey/${name}`, import.meta.url), 'utf8');

describe('UciEngine with the real lite engine', { timeout: TIMEOUT_MS }, () => {
  let engine: UciEngine;

  beforeAll(async () => {
    engine = new UciEngine(createNodeTransport('lite'));
    await engine.start({ multiPv: 2 });
  }, TIMEOUT_MS);

  afterAll(() => {
    engine?.close();
  });

  it('evaluates the starting position as roughly equal, with two different first moves', async () => {
    const result = await engine.evaluate(START, DEPTH);
    expect(result.depth).toBe(DEPTH);
    expect(result.lines.map((line) => line.rank)).toEqual([1, 2]);
    const [first, second] = result.lines;
    expect(first?.score.kind).toBe('cp');
    expect(first?.score.value).toBeGreaterThan(-100);
    expect(first?.score.value).toBeLessThan(100);
    expect(first?.pv[0]).not.toBe(second?.pv[0]);
    // Both lines start with a legal move of the position.
    const legal = new Chess(START).moves({ verbose: true }).map((move) => move.lan);
    expect(legal).toContain(first?.pv[0]);
    expect(legal).toContain(second?.pv[0]);
  });

  it('finds the mate in one for the side to move as mate +1', async () => {
    const result = await engine.evaluate('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', DEPTH);
    expect(result.lines[0]?.score).toEqual({ kind: 'mate', value: 1 });
    expect(result.lines[0]?.pv[0]).toBe('a1a8');
  });

  it('scores a lost position negatively for the side to move (Black here)', async () => {
    const result = await engine.evaluate('7k/8/8/8/8/8/8/R6K b - - 0 1', DEPTH);
    const score = result.lines[0]?.score;
    expect(score).toBeDefined();
    expect(score?.value).toBeLessThan(0);
    if (score?.kind === 'cp') expect(score.value).toBeLessThan(-300);
  });

  it('gives a single line for a position with one legal move although MultiPV is 2', async () => {
    const fen = '4k3/8/8/8/8/8/3N1PPP/4r1K1 w - - 0 1';
    expect(new Chess(fen).moves({ verbose: true }).map((move) => move.lan)).toEqual(['d2f1']);
    const result = await engine.evaluate(fen, DEPTH);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.rank).toBe(1);
    expect(result.lines[0]?.pv[0]).toBe('d2f1');
  });

  it('stops a long search when aborted and is ready for the next one', async () => {
    const controller = new AbortController();
    // Depth 60 cannot finish in the time given: without the abort this test would time out.
    const long = engine.evaluate(START, 60, controller.signal);
    setTimeout(() => controller.abort(), 300);
    const error: unknown = await long.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe('cancelled');

    const next = await engine.evaluate('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', DEPTH);
    expect(next.lines[0]?.pv[0]).toBe('a1a8');
  });

  it('evaluates every position of a real game through evaluateGame', async () => {
    const game = JSON.parse(fixtureFile('game.json')) as GameRecord;
    // Evaluations of the same game made earlier with the full build at depth 18
    // (by an earlier, separate script): an independent reference for the sign of each score.
    const reference = JSON.parse(fixtureFile('analysis.json')) as GameAnalysis;

    engine.newGame();
    const progress: number[] = [];
    const positions = await evaluateGame(
      game,
      { depth: DEPTH, multiPv: 2 },
      // Stand-in for the classification package's curve; only its range matters here.
      { engine, whiteExpected: (score) => (score.kind === 'cp' ? 0.5 : 1) },
      (_position, done) => progress.push(done),
    );

    expect(positions).toHaveLength(86);
    expect(progress).toEqual(Array.from({ length: 86 }, (_, index) => index + 1));
    expect(validateGameAnalysis({ ...reference, positions }, game)).toEqual([]);

    for (const position of positions.slice(0, 85)) {
      expect(position.source).toBe('engine');
      expect(position.depth).toBe(DEPTH);
      const legalMoves = new Chess(position.fen).moves().length;
      expect(position.lines).toHaveLength(Math.min(2, legalMoves));
    }
    // Position 84: White to move and mating with Rh8#, which is the move played.
    expect(positions[84]?.score).toEqual({ kind: 'mate', moves: 1, winner: 'white' });
    expect(positions[84]?.lines[0]?.uci).toEqual(['h7h8']);
    expect(positions[84]?.lines[0]?.san).toEqual(['Rh8#']);
    expect(positions[85]?.score).toEqual({ kind: 'over', winner: 'white' });
    expect(positions[85]?.source).toBe('rules');

    // Wherever the reference is clearly decided (three pawns or a mate), the lite build at
    // depth 10 must at least agree on who is ahead. A wrong point of view would fail on every
    // Black-to-move position.
    const whiteAhead = (score: Score): boolean | null => {
      if (score.kind === 'cp') return Math.abs(score.value) < 300 ? null : score.value > 0;
      return score.winner === null ? null : score.winner === 'white';
    };
    let compared = 0;
    let blackToMoveCompared = 0;
    positions.forEach((position, ply) => {
      const expected = whiteAhead(reference.positions[ply]?.score ?? { kind: 'cp', value: 0 });
      if (expected === null) return;
      compared += 1;
      if (position.fen.split(' ')[1] === 'b') blackToMoveCompared += 1;
      const actual =
        position.score.kind === 'cp' ? position.score.value > 0 : position.score.winner === 'white';
      expect(actual, `position ${ply}`).toBe(expected);
    });
    expect(compared).toBeGreaterThan(20);
    expect(blackToMoveCompared).toBeGreaterThan(10);
  });
});
