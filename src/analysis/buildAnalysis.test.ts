import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateGameAnalysis,
  type EngineInfo,
  type GameAnalysis,
  type GameRecord,
  type MoveCategory,
} from '@/contract';
import { computeAccuracy } from './accuracy';
import { buildAnalysis, reviewMove } from './buildAnalysis';
import { estimateRating } from './rating';

const readJson = <T>(name: string): T =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../fixtures/lichess-LAGvRNey/${name}`, import.meta.url)),
      'utf8',
    ),
  ) as T;

// A real game with real engine evaluations (Stockfish 17.1, depth 18).
const game = readJson<GameRecord>('game.json');
const recorded = readJson<GameAnalysis>('analysis.json');
const positions = recorded.positions;
const opening = { eco: 'C56', name: recorded.opening!.name, lastBookPly: 10 };
const engine: EngineInfo = {
  name: 'Stockfish',
  version: '17.1',
  variant: 'full',
  depth: 18,
  multiPv: 2,
};
const createdAt = '2026-11-13T00:00:00Z';
const build = (g: GameRecord = game, p = positions, o: typeof opening | null = opening) =>
  buildAnalysis({ game: g, positions: p, opening: o, engine, createdAt });

describe('buildAnalysis on a real game', () => {
  const analysis = build();

  it('fits the contract and carries what it was given', () => {
    expect(validateGameAnalysis(analysis, game)).toEqual([]);
    expect(analysis.gameId).toBe(game.id);
    expect(analysis.createdAt).toBe(createdAt);
    expect(analysis.engine).toEqual(engine);
    expect(analysis.opening).toEqual(opening);
    expect(analysis.positions).toEqual(positions);
    expect(analysis.moves).toHaveLength(85);
  });

  it('gives every move the review that reviewMove gives it on its own', () => {
    game.moves.forEach((move, i) => {
      const previousMove = game.moves[i - 1];
      const review = reviewMove({
        move,
        before: positions[i]!,
        after: positions[i + 1]!,
        isBook: move.ply <= opening.lastBookPly,
        previous: previousMove
          ? {
              move: previousMove,
              before: positions[i - 1]!,
              isBook: previousMove.ply <= opening.lastBookPly,
            }
          : null,
      });
      expect(analysis.moves[i]).toEqual(review);
    });
  });

  it('uses the accuracy package for the moves and for both players', () => {
    const accuracy = computeAccuracy(
      positions,
      game.moves.map((m) => m.color),
    );
    expect(analysis.moves.map((m) => m.accuracy)).toEqual(accuracy.perMove);
    expect(analysis.white.accuracy).toBe(accuracy.white);
    expect(analysis.black.accuracy).toBe(accuracy.black);
  });

  it('counts each side’s moves by category', () => {
    const total = (counts: Record<MoveCategory, number>) =>
      Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(total(analysis.white.counts)).toBe(43);
    expect(total(analysis.black.counts)).toBe(42);
    expect(analysis.white.counts.book).toBe(5);
    expect(analysis.black.counts.book).toBe(5);
    const whiteBest = analysis.moves.filter((m, i) => i % 2 === 0 && m.category === 'best');
    expect(analysis.white.counts.best).toBe(whiteBest.length);
  });

  it('estimates each rating from that player’s accuracy, time class and number of moves', () => {
    expect(game.timeControl?.timeClass).toBe('rapid');
    expect(analysis.white.estimatedRating).toEqual(
      estimateRating({ accuracy: analysis.white.accuracy, timeClass: 'rapid', playerMoves: 43 }),
    );
    expect(analysis.black.estimatedRating).toEqual(
      estimateRating({ accuracy: analysis.black.accuracy, timeClass: 'rapid', playerMoves: 42 }),
    );
    expect(analysis.white.estimatedRating).not.toBeNull();
  });
});

describe('buildAnalysis on other shapes of game', () => {
  it('gives no rating estimate when a player has fewer than 10 moves', () => {
    const short = { ...game, moves: game.moves.slice(0, 12) };
    const analysis = build(short, positions.slice(0, 13));
    expect(validateGameAnalysis(analysis, short)).toEqual([]);
    expect(analysis.white.estimatedRating).toBeNull();
    expect(analysis.black.estimatedRating).toBeNull();
  });

  it('still estimates a rating without a time control or ratings (pasted PGN)', () => {
    const bare: GameRecord = {
      ...game,
      timeControl: null,
      white: { ...game.white, rating: null },
      black: { ...game.black, rating: null },
    };
    const analysis = build(bare);
    expect(analysis.white.estimatedRating).toEqual(
      estimateRating({ accuracy: analysis.white.accuracy, timeClass: null, playerMoves: 43 }),
    );
  });

  it('uses no book category when no opening was found', () => {
    const analysis = build(game, positions, null);
    expect(analysis.opening).toBeNull();
    expect(analysis.white.counts.book + analysis.black.counts.book).toBe(0);
  });

  it('leaves errorPlies out when every book move is Book', () => {
    expect(build().opening).not.toHaveProperty('errorPlies');
  });

  // Owner, 2026-11-15 (Fable review A1-05). Fixture HKl8S22m, app engine: 2. Nf3 in the
  // Tennison Gambit is in the book and is a Mistake.
  it('lists the book moves labelled as errors in opening.errorPlies', () => {
    const readOther = <T>(name: string): T =>
      JSON.parse(
        readFileSync(
          fileURLToPath(new URL(`../../fixtures/lichess-HKl8S22m/${name}`, import.meta.url)),
          'utf8',
        ),
      ) as T;
    const trapGame = readOther<GameRecord>('game.json');
    const trapPositions = readOther<GameAnalysis>('analysis-lite.json').positions;
    const given = { eco: 'A06', name: 'Zukertort Opening: Tennison Gambit', lastBookPly: 3 };
    const analysis = build(trapGame, trapPositions, given);
    expect(validateGameAnalysis(analysis, trapGame)).toEqual([]);
    expect(analysis.opening).toEqual({ ...given, errorPlies: [3] });
    expect(analysis.moves[2]?.category).toBe('mistake');
    expect(analysis.white.counts.book).toBe(1);
    expect(given).not.toHaveProperty('errorPlies');
  });

  it('refuses positions that do not belong to the game', () => {
    expect(() => build(game, positions.slice(0, 80))).toThrow();
    const shifted = positions.map((p, i) => (i === 40 ? { ...p, fen: positions[41]!.fen } : p));
    expect(() => build(game, shifted)).toThrow(/contract/);
  });
});
