import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  validateGameAnalysis,
  type GameAnalysis,
  type GameMove,
  type GameRecord,
  type PositionEval,
  type Score,
} from '@/contract';
import { fetchCloudEval, type WhiteEval } from './cloudEval';
import { EngineError } from './errors';
import { evaluateGame, type EvaluateGameDeps } from './evaluateGame';
import type { RawEval } from './uciEngine';

// A real game: EricRosen vs ni5hu, 85 half-moves, White mates (see fixtures/lichess-LAGvRNey).
const fixtureFile = (name: string) =>
  readFileSync(new URL(`../../../fixtures/lichess-LAGvRNey/${name}`, import.meta.url), 'utf8');
const GAME = JSON.parse(fixtureFile('game.json')) as GameRecord;
const OPTIONS = { depth: 12, multiPv: 2 };

// ----------------------------- test doubles -----------------------------

/** A hand-built game record from SAN moves; only the fields evaluateGame reads matter. */
function gameFromSans(sans: string[], startFen?: string): GameRecord {
  const chess = startFen === undefined ? new Chess() : new Chess(startFen);
  const initialFen = chess.fen();
  const moves: GameMove[] = sans.map((san, index) => {
    const fenBefore = chess.fen();
    const move = chess.move(san);
    return {
      ply: index + 1,
      moveNumber: Math.floor(index / 2) + 1,
      color: move.color === 'w' ? 'white' : 'black',
      san: move.san,
      uci: move.lan,
      fenBefore,
      fenAfter: chess.fen(),
      clockSeconds: null,
      spentSeconds: null,
    };
  });
  return {
    id: 'pgn:test',
    source: 'pgn',
    sourceUrl: null,
    playedAt: null,
    white: { name: 'White', rating: null, title: null },
    black: { name: 'Black', rating: null, title: null },
    result: '*',
    termination: 'unknown',
    timeControl: null,
    rated: null,
    initialFen,
    moves,
    pgn: '',
  };
}

/**
 * A legal line from `fen`: its first move is the legal move number `first` (in
 * chess.js order), every later move the first legal one. Stops when the game ends.
 */
function legalLine(fen: string, plies: number, first = 0): string[] {
  const chess = new Chess(fen);
  const line: string[] = [];
  while (line.length < plies) {
    // SAN list rather than the verbose one: chess.js is roughly ten times faster at it.
    const san = chess.moves()[line.length === 0 ? first : 0];
    if (san === undefined) break;
    line.push(chess.move(san).lan);
  }
  return line;
}

/** Canned engine answer: two legal lines, +50 and +20 for the side to move, depth 12. */
function cannedEval(fen: string): RawEval {
  const lines: RawEval['lines'] = [
    { rank: 1, score: { kind: 'cp', value: 50 }, pv: legalLine(fen, 3) },
  ];
  const second = legalLine(fen, 3, 1);
  if (second.length > 0) lines.push({ rank: 2, score: { kind: 'cp', value: 20 }, pv: second });
  return { depth: 12, lines };
}

function fakeEngine(reply: (fen: string) => RawEval = cannedEval) {
  const calls: Array<{ fen: string; depth: number; signal: AbortSignal | undefined }> = [];
  const engine: EvaluateGameDeps['engine'] = {
    evaluate(fen, depth, signal) {
      calls.push({ fen, depth, signal });
      return Promise.resolve().then(() => reply(fen));
    },
  };
  return { engine, calls };
}

/** Canned cloud answer, already White-relative: one legal line, +31, depth 40. */
function cannedCloud(fen: string): WhiteEval {
  return {
    depth: 40,
    lines: [
      { rank: 1, score: { kind: 'cp', value: 31 }, uci: legalLine(fen, 4) },
      { rank: 2, score: { kind: 'cp', value: 12 }, uci: legalLine(fen, 4, 1) },
    ],
  };
}

/** Stand-in for the classification package's curve; distinct values so mix-ups show. */
function whiteExpected(score: Score): number {
  if (score.kind === 'cp') return 0.5 + Math.max(-0.45, Math.min(0.45, score.value / 1000));
  if (score.kind === 'mate') return score.winner === 'white' ? 0.99 : 0.01;
  return score.winner === 'white' ? 1 : score.winner === 'black' ? 0 : 0.5;
}

interface Seen {
  position: PositionEval;
  done: number;
  total: number;
}

function recorder() {
  const seen: Seen[] = [];
  const onPosition = (position: PositionEval, done: number, total: number) => {
    seen.push({ position, done, total });
  };
  return { seen, onPosition };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

function expectEngineError(error: unknown, code: string): EngineError {
  expect(error).toBeInstanceOf(EngineError);
  expect((error as EngineError).code).toBe(code);
  return error as EngineError;
}

/** SAN of a UCI line replayed independently with chess.js. */
function sanOf(fen: string, uci: string[]): string[] {
  const chess = new Chess(fen);
  return uci.map(
    (move) => chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }).san,
  );
}

// --------------------------------- tests ---------------------------------

describe('evaluateGame on a real game with a canned engine', () => {
  it('returns one evaluation per position, in ply order, with the fens of the game', async () => {
    const { engine } = fakeEngine();
    const { seen, onPosition } = recorder();
    const positions = await evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, onPosition);

    expect(positions).toHaveLength(86);
    expect(positions.map((position) => position.ply)).toEqual(
      Array.from({ length: 86 }, (_, ply) => ply),
    );
    expect(positions[0]?.fen).toBe(GAME.initialFen);
    positions.slice(1).forEach((position, index) => {
      expect(position.fen).toBe(GAME.moves[index]?.fenAfter);
    });

    expect(seen).toHaveLength(86);
    expect(seen.map((call) => call.done)).toEqual(Array.from({ length: 86 }, (_, i) => i + 1));
    expect(seen.every((call) => call.total === 86)).toBe(true);
    expect(seen.map((call) => call.position)).toEqual(positions);
  });

  it('reports each position as soon as it is known, before the next search starts', async () => {
    const { engine, calls } = fakeEngine();
    const callsWhenReported: number[] = [];
    await evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, () => {
      callsWhenReported.push(calls.length);
    });
    expect(callsWhenReported.slice(0, 4)).toEqual([1, 2, 3, 4]);
  });

  it('decides the final checkmate by the rules without asking the engine', async () => {
    const { engine, calls } = fakeEngine();
    const positions = await evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, () => {});
    expect(positions[85]).toEqual({
      ply: 85,
      fen: GAME.moves[84]?.fenAfter,
      score: { kind: 'over', winner: 'white' },
      whiteExpected: 1,
      depth: 0,
      lines: [],
      source: 'rules',
    });
    expect(calls).toHaveLength(85);
    expect(calls.map((call) => call.fen)).not.toContain(GAME.moves[84]?.fenAfter);
  });

  it('asks the engine for every other position once, in order, at the requested depth', async () => {
    const { engine, calls } = fakeEngine();
    const controller = new AbortController();
    await evaluateGame(
      GAME,
      { depth: 14, multiPv: 2 },
      { engine, whiteExpected },
      () => {},
      controller.signal,
    );
    expect(calls.map((call) => call.fen)).toEqual([
      GAME.initialFen,
      ...GAME.moves.slice(0, 84).map((move) => move.fenAfter),
    ]);
    expect(calls.every((call) => call.depth === 14)).toBe(true);
    expect(calls.every((call) => call.signal === controller.signal)).toBe(true);
  });

  it("turns side-to-move scores into White's point of view exactly once", async () => {
    const { engine } = fakeEngine();
    const positions = await evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, () => {});
    // Position 0: White to move, canned +50 stays +50. Position 1: Black to move, +50 becomes -50.
    expect(positions[0]?.score).toEqual({ kind: 'cp', value: 50 });
    expect(positions[0]?.lines[1]?.score).toEqual({ kind: 'cp', value: 20 });
    expect(positions[1]?.fen.split(' ')[1]).toBe('b');
    expect(positions[1]?.score).toEqual({ kind: 'cp', value: -50 });
    expect(positions[1]?.lines[0]?.score).toEqual({ kind: 'cp', value: -50 });
    expect(positions[1]?.lines[1]?.score).toEqual({ kind: 'cp', value: -20 });
    for (const position of positions.slice(0, 85)) {
      const blackToMove = position.fen.split(' ')[1] === 'b';
      expect(position.score).toEqual({ kind: 'cp', value: blackToMove ? -50 : 50 });
    }
  });

  it('converts a mate score for the side to move into a named winner', async () => {
    const { engine } = fakeEngine((fen) => ({
      depth: 12,
      lines: [{ rank: 1, score: { kind: 'mate', value: 3 }, pv: legalLine(fen, 1) }],
    }));
    const positions = await evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, () => {});
    expect(positions[0]?.score).toEqual({ kind: 'mate', moves: 3, winner: 'white' });
    expect(positions[1]?.score).toEqual({ kind: 'mate', moves: 3, winner: 'black' });
  });

  it('takes the position score from the best line and whiteExpected from the injected function', async () => {
    const { engine } = fakeEngine();
    const asked: Score[] = [];
    const positions = await evaluateGame(
      GAME,
      OPTIONS,
      {
        engine,
        whiteExpected: (score) => {
          asked.push(score);
          return whiteExpected(score);
        },
      },
      () => {},
    );
    expect(asked).toHaveLength(86);
    positions.forEach((position, index) => {
      expect(asked[index]).toEqual(position.score);
      expect(position.whiteExpected).toBe(whiteExpected(position.score));
      if (position.source !== 'rules') expect(position.score).toEqual(position.lines[0]?.score);
    });
    expect(positions[0]?.whiteExpected).toBe(0.55);
    expect(positions[1]?.whiteExpected).toBe(0.45);
  });

  it('gives each line SAN that matches its UCI, with depth, ranks and source', async () => {
    const { engine } = fakeEngine();
    const positions = await evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, () => {});
    for (const position of positions.slice(0, 85)) {
      expect(position.source).toBe('engine');
      expect(position.depth).toBe(12);
      // The canned engine gives two lines wherever the position has two legal moves.
      const legalMoves = new Chess(position.fen).moves().length;
      expect(position.lines.map((line) => line.rank)).toEqual(legalMoves > 1 ? [1, 2] : [1]);
      for (const line of position.lines) {
        expect(line.uci.length).toBeGreaterThan(0);
        expect(line.san).toEqual(sanOf(position.fen, line.uci));
      }
    }
    expect(positions[0]?.lines[0]?.uci).toEqual(legalLine(GAME.initialFen, 3));
  });

  it('cuts lines to 10 half-moves', async () => {
    const { engine } = fakeEngine((fen) => ({
      depth: 12,
      lines: [{ rank: 1, score: { kind: 'cp', value: 10 }, pv: legalLine(fen, 14) }],
    }));
    const positions = await evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, () => {});
    const line = positions[0]?.lines[0];
    expect(legalLine(GAME.initialFen, 14)).toHaveLength(14);
    expect(line?.uci).toEqual(legalLine(GAME.initialFen, 10));
    expect(line?.san).toHaveLength(10);
  });

  it('cuts a line at the first illegal move', async () => {
    const { engine } = fakeEngine((fen) => {
      const legal = legalLine(fen, 2);
      return {
        depth: 12,
        lines: [{ rank: 1, score: { kind: 'cp', value: 10 }, pv: [...legal, 'a1a8', 'e7e5'] }],
      };
    });
    const positions = await evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, () => {});
    expect(positions[0]?.lines[0]?.uci).toEqual(legalLine(GAME.initialFen, 2));
    expect(positions[0]?.lines[0]?.san).toHaveLength(2);
  });

  it('keeps at most multiPv lines and accepts fewer', async () => {
    const three = (fen: string): RawEval => ({
      depth: 12,
      lines: [0, 1, 2].map((n) => ({
        rank: n + 1,
        score: { kind: 'cp' as const, value: 30 - n },
        pv: legalLine(fen, 1, n),
      })),
    });
    const two = await evaluateGame(
      GAME,
      { depth: 12, multiPv: 2 },
      { engine: fakeEngine(three).engine, whiteExpected },
      () => {},
    );
    expect(two[0]?.lines.map((line) => line.rank)).toEqual([1, 2]);

    const one = (fen: string): RawEval => ({ depth: 9, lines: three(fen).lines.slice(0, 1) });
    const single = await evaluateGame(
      GAME,
      { depth: 12, multiPv: 2 },
      { engine: fakeEngine(one).engine, whiteExpected },
      () => {},
    );
    expect(single[0]?.lines).toHaveLength(1);
    expect(single[0]?.depth).toBe(9);
  });

  it('drops a second line whose first move is illegal and keeps ranks 1..n', async () => {
    const { engine } = fakeEngine((fen) => ({
      depth: 12,
      lines: [
        { rank: 1, score: { kind: 'cp', value: 30 }, pv: legalLine(fen, 2) },
        { rank: 2, score: { kind: 'cp', value: 25 }, pv: ['a1a8'] },
        { rank: 3, score: { kind: 'cp', value: 20 }, pv: legalLine(fen, 2, 1) },
      ],
    }));
    const positions = await evaluateGame(
      GAME,
      { depth: 12, multiPv: 3 },
      { engine, whiteExpected },
      () => {},
    );
    expect(positions[0]?.lines.map((line) => line.rank)).toEqual([1, 2]);
    expect(positions[0]?.lines[1]?.uci).toEqual(legalLine(GAME.initialFen, 2, 1));
    expect(positions[0]?.lines[1]?.score).toEqual({ kind: 'cp', value: 20 });
  });

  it('rejects with engine-crashed when the best line does not start with a legal move', async () => {
    // The second line is fine, but a second choice must never be promoted to best.
    const { engine } = fakeEngine((fen) => ({
      depth: 12,
      lines: [
        { rank: 1, score: { kind: 'cp', value: 30 }, pv: ['a1a8'] },
        { rank: 2, score: { kind: 'cp', value: 20 }, pv: legalLine(fen, 2) },
      ],
    }));
    const { seen, onPosition } = recorder();
    const error = await rejection(
      evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, onPosition),
    );
    expectEngineError(error, 'engine-crashed');
    expect(seen).toHaveLength(0);
  });

  it('rejects with engine-crashed when the engine reports no line at all', async () => {
    const { engine } = fakeEngine(() => ({ depth: 12, lines: [] }));
    expectEngineError(
      await rejection(evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, () => {})),
      'engine-crashed',
    );
  });

  it('rejects with engine-crashed when the best line carries a mate in zero', async () => {
    const { engine } = fakeEngine((fen) => ({
      depth: 12,
      lines: [{ rank: 1, score: { kind: 'mate', value: 0 }, pv: legalLine(fen, 1) }],
    }));
    expectEngineError(
      await rejection(evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, () => {})),
      'engine-crashed',
    );
  });

  it('passes an engine failure on and stops there', async () => {
    let count = 0;
    const { engine, calls } = fakeEngine((fen) => {
      count += 1;
      if (count === 4) throw new EngineError('engine-crashed', 'worker gone');
      return cannedEval(fen);
    });
    const { seen, onPosition } = recorder();
    const error = expectEngineError(
      await rejection(evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, onPosition)),
      'engine-crashed',
    );
    expect(error.detail).toBe('worker gone');
    expect(seen).toHaveLength(3);
    expect(calls).toHaveLength(4);
  });

  it('produces positions that pass the contract validator', async () => {
    const { engine } = fakeEngine();
    const positions = await evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, () => {});
    // The fixture analysis of the same game, with its positions replaced by ours.
    const analysis = JSON.parse(fixtureFile('analysis.json')) as GameAnalysis;
    expect(validateGameAnalysis({ ...analysis, positions }, GAME)).toEqual([]);
  });
});

describe('evaluateGame, positions decided by the rules', () => {
  it('scores a stalemate as over with no winner', async () => {
    // Sam Loyd's ten-move stalemate; Black is left without a legal move.
    const game = gameFromSans(
      'e3 a5 Qh5 Ra6 Qxa5 h5 h4 Rah6 Qxc7 f6 Qxd7+ Kf7 Qxb7 Qd3 Qxb8 Qh7 Qxc8 Kg6 Qe6'.split(' '),
    );
    expect(new Chess(game.moves[18]?.fenAfter).isStalemate()).toBe(true);
    const { engine, calls } = fakeEngine();
    const positions = await evaluateGame(game, OPTIONS, { engine, whiteExpected }, () => {});
    expect(positions).toHaveLength(20);
    expect(positions[19]).toEqual({
      ply: 19,
      fen: game.moves[18]?.fenAfter,
      score: { kind: 'over', winner: null },
      whiteExpected: 0.5,
      depth: 0,
      lines: [],
      source: 'rules',
    });
    expect(calls).toHaveLength(19);
  });

  it('names Black as the winner when White is checkmated', async () => {
    const game = gameFromSans(['f3', 'e5', 'g4', 'Qh4#']);
    const { engine, calls } = fakeEngine();
    const positions = await evaluateGame(game, OPTIONS, { engine, whiteExpected }, () => {});
    expect(positions[4]?.score).toEqual({ kind: 'over', winner: 'black' });
    expect(positions[4]?.whiteExpected).toBe(0);
    expect(calls).toHaveLength(4);
  });

  it('scores bare kings as over with no winner', async () => {
    // Hand-built: the white king takes the last piece.
    const game = gameFromSans(['Kxb2'], 'k7/8/8/8/8/8/1r6/K7 w - - 0 1');
    const { engine, calls } = fakeEngine();
    const positions = await evaluateGame(game, OPTIONS, { engine, whiteExpected }, () => {});
    expect(positions[1]?.score).toEqual({ kind: 'over', winner: null });
    expect(positions[1]?.source).toBe('rules');
    expect(calls).toHaveLength(1);
  });

  it('still searches a position where only the fifty-move rule would allow a draw claim', async () => {
    // Hand-built: the half-move clock reaches 100 with the game still going on.
    const game = gameFromSans(['Kd3'], '8/8/4k3/8/8/4K3/4P3/8 w - - 99 80');
    const after = game.moves[0]?.fenAfter ?? '';
    expect(after.split(' ')[4]).toBe('100');
    expect(new Chess(after).isGameOver()).toBe(true);
    const { engine, calls } = fakeEngine();
    const positions = await evaluateGame(game, OPTIONS, { engine, whiteExpected }, () => {});
    expect(calls).toHaveLength(2);
    expect(positions[1]?.source).toBe('engine');
    expect(positions[1]?.score.kind).toBe('cp');
  });

  it('rejects with unsupported-game when a position of the game is not a valid FEN', async () => {
    const game = gameFromSans(['e4', 'e5']);
    const broken: GameRecord = {
      ...game,
      moves: game.moves.map((move, index) =>
        index === 1 ? { ...move, fenAfter: 'not a position' } : move,
      ),
    };
    const { engine } = fakeEngine();
    const { seen, onPosition } = recorder();
    const error = expectEngineError(
      await rejection(evaluateGame(broken, OPTIONS, { engine, whiteExpected }, onPosition)),
      'unsupported-game',
    );
    expect(error.detail).toContain('2');
    expect(seen).toHaveLength(2);
  });
});

describe('evaluateGame with cloud eval', () => {
  it('uses cloud hits, searches locally on a miss, and stops asking after two misses in a row', async () => {
    const { engine, calls } = fakeEngine();
    const asked: string[] = [];
    const cloud = (fen: string) => {
      asked.push(fen);
      return Promise.resolve(asked.length <= 6 ? cannedCloud(fen) : null);
    };
    const positions = await evaluateGame(GAME, OPTIONS, { engine, cloud, whiteExpected }, () => {});

    expect(positions.slice(0, 6).map((position) => position.source)).toEqual(
      Array.from({ length: 6 }, () => 'cloud'),
    );
    expect(positions.slice(6, 85).every((position) => position.source === 'engine')).toBe(true);
    expect(positions[85]?.source).toBe('rules');
    // Six hits, then the two misses (positions 6 and 7); never asked again.
    expect(asked).toEqual([
      GAME.initialFen,
      ...GAME.moves.slice(0, 7).map((move) => move.fenAfter),
    ]);
    expect(calls).toHaveLength(79);
    expect(calls[0]?.fen).toBe(GAME.moves[5]?.fenAfter);
  });

  it('keeps cloud scores as they are (already White-relative) and adds SAN', async () => {
    const { engine } = fakeEngine();
    const cloud = (fen: string) => Promise.resolve(cannedCloud(fen));
    const positions = await evaluateGame(GAME, OPTIONS, { engine, cloud, whiteExpected }, () => {});
    // Position 1 has Black to move; the cloud's +31 must not be flipped.
    const position = positions[1];
    expect(position?.source).toBe('cloud');
    expect(position?.depth).toBe(40);
    expect(position?.score).toEqual({ kind: 'cp', value: 31 });
    expect(position?.whiteExpected).toBe(whiteExpected({ kind: 'cp', value: 31 }));
    expect(position?.lines.map((line) => line.rank)).toEqual([1, 2]);
    expect(position?.lines[0]?.uci).toEqual(legalLine(position?.fen ?? '', 4));
    expect(position?.lines[0]?.san).toEqual(
      sanOf(position?.fen ?? '', position?.lines[0]?.uci ?? []),
    );
    expect(position?.lines[1]?.score).toEqual({ kind: 'cp', value: 12 });
  });

  it("turns the cloud's king-takes-rook castling (e1h1) into e1g1 with the SAN O-O, end to end", async () => {
    // The response Lichess really gave for this position (see __fixtures__/README.md), served
    // by a stub fetch through the real fetchCloudEval.
    const recorded = readFileSync(
      new URL('./__fixtures__/cloud-eval-ruy-lopez-castling.json', import.meta.url),
      'utf8',
    );
    expect((JSON.parse(recorded) as { pvs: Array<{ moves: string }> }).pvs[0]?.moves).toBe(
      'e1h1 f6e4 d2d4 b7b5 a4b3 d7d5 d4e5 c8e6 b1d2 e4c5',
    );
    const game = gameFromSans('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6'.split(' '));
    const ruy = game.moves[7]?.fenAfter ?? '';
    expect((JSON.parse(recorded) as { fen: string }).fen).toBe(ruy);
    const stubFetch: typeof fetch = () => Promise.resolve(new Response(recorded));
    const { engine, calls } = fakeEngine();
    const cloud = (fen: string): Promise<WhiteEval | null> =>
      fen === ruy
        ? fetchCloudEval(fen, { multiPv: 2, minDepth: 12, fetch: stubFetch })
        : Promise.resolve(cannedCloud(fen));
    const positions = await evaluateGame(game, OPTIONS, { engine, cloud, whiteExpected }, () => {});

    const position = positions[8];
    expect(calls).toHaveLength(0);
    expect(position?.source).toBe('cloud');
    expect(position?.depth).toBe(55);
    // White to move, and the recorded +28 is White's view either way.
    expect(position?.score).toEqual({ kind: 'cp', value: 28 });
    expect(position?.lines[0]?.uci).toEqual(
      'e1g1 f6e4 d2d4 b7b5 a4b3 d7d5 d4e5 c8e6 b1d2 e4c5'.split(' '),
    );
    expect(position?.lines[0]?.san).toEqual('O-O Nxe4 d4 b5 Bb3 d5 dxe5 Be6 Nbd2 Nc5'.split(' '));
    // Black's castling inside the second line (e8h8 as recorded) comes out as e8g8 / O-O.
    expect(position?.lines[1]?.uci[7]).toBe('e8g8');
    expect(position?.lines[1]?.san[7]).toBe('O-O');
  });

  it('resets the miss count after a hit', async () => {
    const { engine } = fakeEngine();
    // hit, miss, hit, miss, miss -> stop.
    const pattern = [true, false, true, false, false, true, true];
    let asked = 0;
    const cloud = (fen: string) => {
      const hit = pattern[asked] ?? true;
      asked += 1;
      return Promise.resolve(hit ? cannedCloud(fen) : null);
    };
    const positions = await evaluateGame(GAME, OPTIONS, { engine, cloud, whiteExpected }, () => {});
    expect(asked).toBe(5);
    expect(positions.slice(0, 7).map((position) => position.source)).toEqual([
      'cloud',
      'engine',
      'cloud',
      'engine',
      'engine',
      'engine',
      'engine',
    ]);
  });

  it('searches locally when cloud rejects, and counts that as a miss', async () => {
    const { engine, calls } = fakeEngine();
    let asked = 0;
    const cloud = () => {
      asked += 1;
      return Promise.reject(new Error('network down'));
    };
    const positions = await evaluateGame(GAME, OPTIONS, { engine, cloud, whiteExpected }, () => {});
    expect(positions).toHaveLength(86);
    expect(positions.slice(0, 85).every((position) => position.source === 'engine')).toBe(true);
    expect(asked).toBe(2);
    expect(calls).toHaveLength(85);
  });

  it('searches locally when cloud throws synchronously', async () => {
    const { engine } = fakeEngine();
    const cloud = (): Promise<WhiteEval | null> => {
      throw new Error('boom');
    };
    const positions = await evaluateGame(GAME, OPTIONS, { engine, cloud, whiteExpected }, () => {});
    expect(positions[0]?.source).toBe('engine');
  });

  it('treats a cloud answer without a legal first move as a miss', async () => {
    const { engine, calls } = fakeEngine();
    const cloud = (): Promise<WhiteEval | null> =>
      Promise.resolve({
        depth: 40,
        lines: [
          { rank: 1, score: { kind: 'cp', value: 31 }, uci: ['a1a8'] },
          { rank: 2, score: { kind: 'cp', value: 12 }, uci: ['e2e4'] },
        ],
      });
    const positions = await evaluateGame(GAME, OPTIONS, { engine, cloud, whiteExpected }, () => {});
    expect(positions[0]?.source).toBe('engine');
    expect(calls).toHaveLength(85);
  });

  it('does not ask the cloud about a position decided by the rules', async () => {
    const game = gameFromSans(['f3', 'e5', 'g4', 'Qh4#']);
    const { engine } = fakeEngine();
    const asked: string[] = [];
    const cloud = (fen: string) => {
      asked.push(fen);
      return Promise.resolve(cannedCloud(fen));
    };
    await evaluateGame(game, OPTIONS, { engine, cloud, whiteExpected }, () => {});
    expect(asked).toHaveLength(4);
  });
});

describe('evaluateGame, cancelling', () => {
  it('rejects with cancelled and reports nothing when the signal is already aborted', async () => {
    const { engine, calls } = fakeEngine();
    const { seen, onPosition } = recorder();
    const controller = new AbortController();
    controller.abort();
    expectEngineError(
      await rejection(
        evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, onPosition, controller.signal),
      ),
      'cancelled',
    );
    expect(seen).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('stops after the position being reported when the signal aborts mid-game', async () => {
    // This engine ignores the signal, so stopping is entirely up to evaluateGame.
    const { engine, calls } = fakeEngine();
    const controller = new AbortController();
    const seen: number[] = [];
    const error = await rejection(
      evaluateGame(
        GAME,
        OPTIONS,
        { engine, whiteExpected },
        (position) => {
          seen.push(position.ply);
          if (position.ply === 2) controller.abort();
        },
        controller.signal,
      ),
    );
    expectEngineError(error, 'cancelled');
    expect(seen).toEqual([0, 1, 2]);
    expect(calls).toHaveLength(3);
  });

  it('does not report a position whose search finished after the signal aborted', async () => {
    const controller = new AbortController();
    const { engine } = fakeEngine((fen) => {
      controller.abort();
      return cannedEval(fen);
    });
    const { seen, onPosition } = recorder();
    expectEngineError(
      await rejection(
        evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, onPosition, controller.signal),
      ),
      'cancelled',
    );
    expect(seen).toHaveLength(0);
  });

  it('does not search when the signal aborts during the cloud request', async () => {
    const controller = new AbortController();
    const { engine, calls } = fakeEngine();
    const cloud = (): Promise<WhiteEval | null> => {
      controller.abort();
      return Promise.resolve(null);
    };
    const { seen, onPosition } = recorder();
    expectEngineError(
      await rejection(
        evaluateGame(
          GAME,
          OPTIONS,
          { engine, cloud, whiteExpected },
          onPosition,
          controller.signal,
        ),
      ),
      'cancelled',
    );
    expect(calls).toHaveLength(0);
    expect(seen).toHaveLength(0);
  });

  it('passes on the cancelled error of the engine', async () => {
    const { engine } = fakeEngine(() => {
      throw new EngineError('cancelled');
    });
    expectEngineError(
      await rejection(evaluateGame(GAME, OPTIONS, { engine, whiteExpected }, () => {})),
      'cancelled',
    );
  });
});

describe('evaluateGame, arguments', () => {
  it('rejects a depth or multiPv that is not a positive whole number', async () => {
    const { engine, calls } = fakeEngine();
    const deps = { engine, whiteExpected };
    await expect(
      evaluateGame(GAME, { depth: 0, multiPv: 2 }, deps, () => {}),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      evaluateGame(GAME, { depth: 12, multiPv: 1.5 }, deps, () => {}),
    ).rejects.toBeInstanceOf(RangeError);
    expect(calls).toHaveLength(0);
  });

  it('evaluates a game without moves as its single starting position', async () => {
    const game = gameFromSans([]);
    const { engine } = fakeEngine();
    const { seen, onPosition } = recorder();
    const positions = await evaluateGame(game, OPTIONS, { engine, whiteExpected }, onPosition);
    expect(positions).toHaveLength(1);
    expect(seen.map((call) => [call.done, call.total])).toEqual([[1, 1]]);
  });
});

// Speed round (owner, 2026-11-15): several engines search different positions at once.
describe('evaluateGame with several searches at once', () => {
  /** An engine whose answers come back in a scrambled order, counting searches in flight. */
  function scrambledEngine() {
    let inFlight = 0;
    let most = 0;
    let n = 0;
    const engine: EvaluateGameDeps['engine'] = {
      async evaluate(fen) {
        inFlight += 1;
        most = Math.max(most, inFlight);
        const wait = (n++ * 7) % 5; // later positions can finish first
        await new Promise((resolve) => setTimeout(resolve, wait));
        inFlight -= 1;
        return cannedEval(fen);
      },
    };
    return { engine, most: () => most };
  }

  it('gives the same positions as one search at a time, reported in ply order', async () => {
    const one = await evaluateGame(
      GAME,
      OPTIONS,
      { engine: fakeEngine().engine, whiteExpected },
      () => {},
    );
    const { engine, most } = scrambledEngine();
    const { seen, onPosition } = recorder();
    const four = await evaluateGame(
      GAME,
      { ...OPTIONS, concurrency: 4 },
      { engine, whiteExpected },
      onPosition,
    );
    expect(four).toEqual(one);
    expect(seen.map((s) => s.position.ply)).toEqual(one.map((p) => p.ply));
    expect(seen.map((s) => s.done)).toEqual(one.map((_, i) => i + 1));
    expect(most()).toBe(4);
  });

  it('stops at the first failure and starts nothing after it', async () => {
    let calls = 0;
    const engine: EvaluateGameDeps['engine'] = {
      async evaluate(fen) {
        calls += 1;
        if (calls === 6) throw new EngineError('engine-crashed', 'boom');
        await new Promise((resolve) => setTimeout(resolve, 1));
        return cannedEval(fen);
      },
    };
    const error = await rejection(
      evaluateGame(GAME, { ...OPTIONS, concurrency: 3 }, { engine, whiteExpected }, () => {}),
    );
    expectEngineError(error, 'engine-crashed');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toBeLessThanOrEqual(8);
  });
});
