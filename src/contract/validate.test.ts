import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION,
  emptyCounts,
  validateGameAnalysis,
  type GameAnalysis,
  type GameRecord,
  type PositionEval,
} from './index';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

// A two-move game (1. e4 e5) built by hand, so each rule can be broken in isolation.
function tinyGame(): GameRecord {
  return {
    id: 'pgn:tiny',
    source: 'pgn',
    sourceUrl: null,
    playedAt: null,
    white: { name: 'White', rating: null, title: null },
    black: { name: 'Black', rating: null, title: null },
    result: '*',
    termination: 'unknown',
    timeControl: null,
    rated: null,
    initialFen: START,
    moves: [
      {
        ply: 1,
        moveNumber: 1,
        color: 'white',
        san: 'e4',
        uci: 'e2e4',
        fenBefore: START,
        fenAfter: AFTER_E4,
        clockSeconds: null,
        spentSeconds: null,
      },
      {
        ply: 2,
        moveNumber: 1,
        color: 'black',
        san: 'e5',
        uci: 'e7e5',
        fenBefore: AFTER_E4,
        fenAfter: AFTER_E5,
        clockSeconds: null,
        spentSeconds: null,
      },
    ],
    pgn: '1. e4 e5 *',
  };
}

function position(ply: number, fen: string, uci: string, san: string): PositionEval {
  return {
    ply,
    fen,
    score: { kind: 'cp', value: 20 },
    whiteExpected: 0.52,
    depth: 16,
    lines: [{ rank: 1, score: { kind: 'cp', value: 20 }, uci: [uci], san: [san] }],
    source: 'engine',
  };
}

function tinyAnalysis(): GameAnalysis {
  return {
    contractVersion: CONTRACT_VERSION,
    gameId: 'pgn:tiny',
    createdAt: '2026-11-13T00:00:00.000Z',
    engine: { name: 'Stockfish', version: '17.1', variant: 'lite', depth: 16, multiPv: 2 },
    opening: null,
    positions: [
      position(0, START, 'e2e4', 'e4'),
      position(1, AFTER_E4, 'e7e5', 'e5'),
      position(2, AFTER_E5, 'g1f3', 'Nf3'),
    ],
    moves: [
      {
        ply: 1,
        category: 'best',
        pointLoss: 0,
        accuracy: 100,
        playedIsBest: true,
        best: { uci: 'e2e4', san: 'e4' },
        tags: [],
      },
      {
        ply: 2,
        category: 'best',
        pointLoss: 0,
        accuracy: 100,
        playedIsBest: true,
        best: { uci: 'e7e5', san: 'e5' },
        tags: [],
      },
    ],
    white: { accuracy: 100, estimatedRating: null, counts: { ...emptyCounts(), best: 1 } },
    black: { accuracy: 100, estimatedRating: null, counts: { ...emptyCounts(), best: 1 } },
  };
}

describe('validateGameAnalysis', () => {
  it('accepts a well-formed analysis', () => {
    expect(validateGameAnalysis(tinyAnalysis(), tinyGame())).toEqual([]);
  });

  it('requires one position more than there are moves', () => {
    const analysis = tinyAnalysis();
    analysis.positions.pop();
    expect(validateGameAnalysis(analysis, tinyGame())).toContain('expected 3 positions, got 2');
  });

  it('rejects a position whose fen is not the one in the game', () => {
    const analysis = tinyAnalysis();
    analysis.positions[1]!.fen = START;
    expect(validateGameAnalysis(analysis, tinyGame())).toContain(
      'position 1: fen does not match the game',
    );
  });

  it('rejects expected points outside 0..1', () => {
    const analysis = tinyAnalysis();
    analysis.positions[0]!.whiteExpected = 1.2;
    expect(validateGameAnalysis(analysis, tinyGame())[0]).toMatch(
      /whiteExpected 1.2 is outside 0..1/,
    );
  });

  it('rejects a mate score without a positive move count', () => {
    const analysis = tinyAnalysis();
    analysis.positions[2]!.score = { kind: 'mate', moves: 0, winner: 'white' };
    expect(validateGameAnalysis(analysis, tinyGame())).toContain(
      'position 2: mate score needs moves >= 1',
    );
  });

  it('requires a finished position to come from the rules, with no lines', () => {
    const analysis = tinyAnalysis();
    analysis.positions[2]!.score = { kind: 'over', winner: 'white' };
    const problems = validateGameAnalysis(analysis, tinyGame());
    expect(problems).toContain('position 2: game is over but lines are present');
    expect(problems).toContain('position 2: game is over but source is not "rules"');
  });

  it('rejects a single-number rating estimate', () => {
    const analysis = tinyAnalysis();
    analysis.white.estimatedRating = { low: 1500, high: 1500 };
    expect(validateGameAnalysis(analysis, tinyGame())).toContain(
      'white: estimatedRating must be a range with low < high',
    );
  });

  it('rejects category counts that do not match the moves', () => {
    const analysis = tinyAnalysis();
    analysis.black.counts.blunder = 1;
    expect(validateGameAnalysis(analysis, tinyGame())).toContain(
      'black: counts.blunder is 1, moves show 0',
    );
  });

  it('ties the "book" category to the opening', () => {
    const analysis = tinyAnalysis();
    analysis.opening = { eco: 'C20', name: "King's Pawn Game", lastBookPly: 2 };
    const problems = validateGameAnalysis(analysis, tinyGame());
    expect(problems).toContain(
      'move 1: "book" must be used for exactly the moves up to opening.lastBookPly',
    );
  });

  // Owner, 2026-11-15 (Fable review A1-05): a book move that is a real error keeps its error.
  describe('opening.errorPlies (optional)', () => {
    /** 1. e4 is Book, 1...e5 is in the book too but is labelled an Inaccuracy. */
    function withBookError(): GameAnalysis {
      const analysis = tinyAnalysis();
      analysis.opening = {
        eco: 'C20',
        name: "King's Pawn Game",
        lastBookPly: 2,
        errorPlies: [2],
      };
      analysis.moves[0]!.category = 'book';
      analysis.moves[1]!.category = 'inaccuracy';
      analysis.white.counts = { ...emptyCounts(), book: 1 };
      analysis.black.counts = { ...emptyCounts(), inaccuracy: 1 };
      return analysis;
    }

    it('accepts a book move labelled as the error it is', () => {
      expect(validateGameAnalysis(withBookError(), tinyGame())).toEqual([]);
    });

    it('accepts each of the three errors and an empty list', () => {
      for (const category of ['inaccuracy', 'mistake', 'blunder'] as const) {
        const analysis = withBookError();
        analysis.moves[1]!.category = category;
        analysis.black.counts = { ...emptyCounts(), [category]: 1 };
        expect(validateGameAnalysis(analysis, tinyGame())).toEqual([]);
      }
      const plain = withBookError();
      plain.opening!.errorPlies = [];
      plain.moves[1]!.category = 'book';
      plain.black.counts = { ...emptyCounts(), book: 1 };
      expect(validateGameAnalysis(plain, tinyGame())).toEqual([]);
    });

    it('rejects a listed ply whose move is not an Inaccuracy, Mistake or Blunder', () => {
      const analysis = withBookError();
      analysis.moves[1]!.category = 'miss';
      analysis.black.counts = { ...emptyCounts(), miss: 1 };
      expect(validateGameAnalysis(analysis, tinyGame())).toContain(
        'move 2: opening.errorPlies lists it, so it must be an inaccuracy, mistake or blunder',
      );
    });

    it('rejects a listed ply that is still Book', () => {
      const analysis = withBookError();
      analysis.moves[1]!.category = 'book';
      analysis.black.counts = { ...emptyCounts(), book: 1 };
      expect(validateGameAnalysis(analysis, tinyGame())).toContain(
        'move 2: opening.errorPlies lists it, so it must be an inaccuracy, mistake or blunder',
      );
    });

    it('still rejects an error in the book that is not listed', () => {
      const analysis = withBookError();
      delete analysis.opening!.errorPlies;
      expect(validateGameAnalysis(analysis, tinyGame())).toContain(
        'move 2: "book" must be used for exactly the moves up to opening.lastBookPly',
      );
    });

    it('rejects a list that is out of range, unordered or repeated', () => {
      const problem = 'opening.errorPlies must be increasing whole plies within 1..lastBookPly';
      for (const errorPlies of [[3], [0], [2, 2], [2, 1], [1.5]]) {
        const analysis = withBookError();
        analysis.opening!.errorPlies = errorPlies;
        expect(validateGameAnalysis(analysis, tinyGame())).toContain(problem);
      }
    });
  });

  it('rejects playedIsBest that disagrees with the best move', () => {
    const analysis = tinyAnalysis();
    analysis.moves[0]!.playedIsBest = false;
    expect(validateGameAnalysis(analysis, tinyGame())).toContain(
      'move 1: playedIsBest disagrees with best.uci',
    );
  });
});

describe('fixtures', () => {
  const root = join(import.meta.dirname, '../../fixtures');
  const folders = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  it('has at least one fixture', () => {
    expect(folders.length).toBeGreaterThan(0);
  });

  for (const folder of folders) {
    it(`${folder.name} obeys the contract`, () => {
      const read = (name: string) =>
        JSON.parse(readFileSync(join(root, folder.name, name), 'utf8')) as unknown;
      const game = read('game.json') as GameRecord;
      const analysis = read('analysis.json') as GameAnalysis;
      expect(validateGameAnalysis(analysis, game)).toEqual([]);
    });
  }
});
