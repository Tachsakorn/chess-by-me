import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  emptyCounts,
  validateGameAnalysis,
  type GameAnalysis,
  type GameRecord,
  type MoveReview,
  type PlayerSummary,
} from '@/contract';
import analysisJson from '../../../fixtures/lichess-LAGvRNey/analysis.json';
import gameJson from '../../../fixtures/lichess-LAGvRNey/game.json';
import hkl8Lite from '../../../fixtures/lichess-HKl8S22m/analysis-lite.json';
import hkl8Game from '../../../fixtures/lichess-HKl8S22m/game.json';
import { classifyGame, classifyMove, type MoveClassification } from './classifyGame';
import { findOpening, loadOpeningBook } from './opening';
import {
  cp,
  gameFrom,
  mate,
  moveFrom,
  over,
  position,
  positionsFor,
  START_FEN,
} from './testSupport';

// A real game with real Stockfish evaluations (depth 18, two lines). The fixture's own
// categories are provisional and are not used here: only `positions` is read.
const game = gameJson as GameRecord;
const fixture = analysisJson as unknown as GameAnalysis;

async function classifyFixture(): Promise<MoveClassification[]> {
  const book = await loadOpeningBook();
  const opening = findOpening(
    book,
    game.moves.map((move) => move.fenAfter),
  );
  return classifyGame({ game, positions: fixture.positions, opening });
}

describe('classifyGame on the real fixture game', () => {
  it('returns one result per move, in order', async () => {
    const results = await classifyFixture();
    expect(results.map((result) => result.ply)).toEqual(
      Array.from({ length: 85 }, (_, index) => index + 1),
    );
  });

  it('marks exactly the moves up to the last book ply as book', async () => {
    const results = await classifyFixture();
    const bookPlies = results.filter((r) => r.category === 'book').map((r) => r.ply);
    expect(bookPlies).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('reports the engine’s first choice and whether it was played', async () => {
    const results = await classifyFixture();
    for (const result of results) {
      const first = fixture.positions[result.ply - 1]?.lines[0];
      const played = game.moves[result.ply - 1];
      expect(result.best).toEqual({ uci: first?.uci[0], san: first?.san[0] });
      expect(result.playedIsBest).toBe(played?.uci === first?.uci[0]);
    }
  });

  it('keeps every point loss between 0 and 1', async () => {
    for (const result of await classifyFixture()) {
      expect(result.pointLoss).toBeGreaterThanOrEqual(0);
      expect(result.pointLoss).toBeLessThanOrEqual(1);
    }
  });

  it('gives the engine’s first choice a point loss of zero', async () => {
    for (const result of await classifyFixture()) {
      if (result.playedIsBest) expect(result.pointLoss).toBe(0);
    }
  });

  it('calls the checkmating move best, with nothing lost', async () => {
    const last = (await classifyFixture())[84];
    expect(last).toEqual({
      ply: 85,
      category: 'best',
      pointLoss: 0,
      playedIsBest: true,
      best: { uci: 'h7h8', san: 'Rh8#' },
      tags: [],
    });
  });

  it('calls 42...c3, which allows mate in one, a blunder that allows mate', async () => {
    // Before: +541 for White. After: White mates in 1.
    const move84 = (await classifyFixture())[83];
    expect(move84?.category).toBe('blunder');
    expect(move84?.tags).toEqual(['allows-mate']);
    // Black held 1 - 0.8692 = 0.1308 expected points and keeps none.
    expect(move84?.pointLoss).toBeCloseTo(0.1308, 4);
  });

  it('calls 39...Kf8, the only legal move, best and forced', async () => {
    expect(new Chess(game.moves[77]?.fenBefore).moves()).toHaveLength(1);
    const move78 = (await classifyFixture())[77];
    expect(move78?.category).toBe('best');
    expect(move78?.tags).toEqual(['forced']);
    expect(move78?.pointLoss).toBe(0);
  });

  // Hand-computed from the stored scores with 1 / (1 + e^(-0.0035 cp)).
  it.each([
    [14, 'O-O', 'inaccuracy'], // +19 -> +128: Black gives up 0.0936
    [16, 'd5', 'mistake'], // +99 -> +251: Black gives up 0.1207
    [21, 'Re4', 'inaccuracy'], // +280 -> +193: White gives up 0.0644 (Good before the 0.05 line)
    [13, 'Re1', 'best'], // first choice; the second choice is only 0.013 worse
  ] as const)('grades move %i (%s) as %s', async (ply, san, category) => {
    const result = (await classifyFixture())[ply - 1];
    expect(game.moves[ply - 1]?.san).toBe(san);
    expect(result?.category).toBe(category);
  });

  it('calls 8. h3 great: the first choice, and the second choice gives up 0.104', async () => {
    // +128 for h3 against +7 for the second line: 0.6102 - 0.5061.
    const move15 = (await classifyFixture())[14];
    expect(game.moves[14]?.san).toBe('h3');
    expect(move15?.category).toBe('great');
    expect(move15?.tags).toEqual(['only-good-move']);
  });

  it('does not call 10. hxg4 great: the knight it takes was simply hanging', async () => {
    // First choice, and the second choice gives up 0.203, but it wins free material.
    const move19 = (await classifyFixture())[18];
    expect(game.moves[18]?.san).toBe('hxg4');
    expect(move19?.category).toBe('best');
  });

  it('fits the contract once accuracy and the player summaries are added', async () => {
    const results = await classifyFixture();
    const moves: MoveReview[] = results.map((result) => ({ ...result, accuracy: 100 }));
    const summary = (color: 'white' | 'black'): PlayerSummary => {
      const counts = emptyCounts();
      moves.forEach((review, index) => {
        if (game.moves[index]?.color === color) counts[review.category] += 1;
      });
      return { accuracy: 100, estimatedRating: null, counts };
    };
    const book = await loadOpeningBook();
    const analysis: GameAnalysis = {
      contractVersion: 1,
      gameId: game.id,
      createdAt: '2026-11-13T00:00:00Z',
      engine: fixture.engine,
      opening: findOpening(
        book,
        game.moves.map((move) => move.fenAfter),
      ),
      positions: fixture.positions,
      moves,
      white: summary('white'),
      black: summary('black'),
    };
    expect(validateGameAnalysis(analysis, game)).toEqual([]);
  });

  it('classifies without a second engine line, and then never awards great', async () => {
    const book = await loadOpeningBook();
    const opening = findOpening(
      book,
      game.moves.map((move) => move.fenAfter),
    );
    const oneLine = fixture.positions.map((position) => ({
      ...position,
      lines: position.lines.slice(0, 1),
    }));
    const results = classifyGame({ game, positions: oneLine, opening });
    expect(results).toHaveLength(85);
    expect(results.filter((result) => result.category === 'great')).toEqual([]);
    // The great move of the two-line run falls back to best.
    expect(results[14]?.category).toBe('best');
  });

  it('uses no book category when the game has no opening', () => {
    const results = classifyGame({ game, positions: fixture.positions, opening: null });
    expect(results.filter((result) => result.category === 'book')).toEqual([]);
  });

  it('refuses evaluations that do not match the number of moves', () => {
    expect(() =>
      classifyGame({ game, positions: fixture.positions.slice(0, 80), opening: null }),
    ).toThrow(/86 positions/);
  });
});

// 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6: a real line with hand-built scores. Unless a ply is
// listed as "first choice", the engine's lines start with other moves.
const LINE = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6'];

function classifyLine(
  scores: Parameters<typeof positionsFor>[1],
  options: { firstChoice?: number[]; lastBookPly?: number } = {},
): MoveClassification[] {
  const line = gameFrom(LINE.slice(0, scores.length - 1));
  return classifyGame({
    game: line,
    positions: positionsFor(line, scores, options.firstChoice),
    opening: options.lastBookPly
      ? { eco: 'C50', name: 'Test', lastBookPly: options.lastBookPly }
      : null,
  });
}

describe('classifyGame: mate scores', () => {
  it('does not treat a longer mate for the mover as an error', () => {
    // White had mate in 2 and now has mate in 6.
    const [first] = classifyLine([mate(2, 'white'), mate(6, 'white')]);
    expect(first).toMatchObject({ category: 'good', pointLoss: 0, tags: [] });
  });

  // Fable review A1-01: 37% of the win chance is gone, so never milder than the ladder's Blunder.
  it('calls losing a forced mate a blunder with a missed mate when the mover ends up near level', () => {
    const [first] = classifyLine([mate(3, 'white'), cp(150)]);
    expect(first?.category).toBe('blunder');
    expect(first?.tags).toEqual(['missed-mate']);
    // A certain point became 0.6283.
    expect(first?.pointLoss).toBeCloseTo(0.3717, 4);
  });

  it('keeps the missed-mate tag when the mover is still winning easily', () => {
    // WintrChess's ladder calls mate -> +900 "excellent"; the fact is still worth a note.
    // Mate in 4: longer than rule b's 3 moves (owner, 2026-11-15), so Excellent stands.
    const [first] = classifyLine([mate(4, 'white'), cp(900)]);
    expect(first?.category).toBe('excellent');
    expect(first?.tags).toEqual(['missed-mate']);
  });

  it('calls letting mate in 3 go a Miss even when still winning easily (rule b)', () => {
    // Was "excellent" before 2026-11-15.
    const [first] = classifyLine([mate(3, 'white'), cp(900)]);
    expect(first).toMatchObject({ category: 'miss', tags: ['missed-mate'] });
  });

  it('tags a move that lets the opponent force mate', () => {
    // The game was level and Black walks into mate in 2.
    const [, second] = classifyLine([cp(0), cp(0), mate(2, 'white')]);
    expect(second?.category).toBe('blunder');
    expect(second?.tags).toEqual(['allows-mate', 'throws-away-advantage']);
    expect(second?.pointLoss).toBe(0.5);
  });

  it('leaves the throws-away tag off when the mover was already clearly worse', () => {
    // +100 for White: Black held 0.4134, below the "at least equal" line of 0.455.
    const [, second] = classifyLine([cp(100), cp(100), mate(2, 'white')]);
    expect(second?.category).toBe('blunder');
    expect(second?.tags).toEqual(['allows-mate']);
  });

  // Fable review A1-01: a distant mate from a level game still throws the game away.
  it('calls allowing a distant forced mate from a level game a blunder', () => {
    const [, second] = classifyLine([cp(0), cp(0), mate(7, 'white')]);
    expect(second?.category).toBe('blunder');
    expect(second?.tags).toEqual(['allows-mate', 'throws-away-advantage']);
  });

  it('tags a distant forced mate when the mover was already lost, with the milder label', () => {
    const [, second] = classifyLine([cp(900), cp(900), mate(7, 'white')]);
    expect(second?.category).toBe('inaccuracy');
    expect(second?.tags).toEqual(['allows-mate']);
  });

  it('does not say a move allows mate when the mover was being mated already', () => {
    const [, second] = classifyLine([cp(50), mate(4, 'white'), mate(4, 'white')]);
    expect(second).toMatchObject({ category: 'best', tags: [], pointLoss: 0 });
  });

  it('gives every tag that applies when a forced mate is turned into being mated', () => {
    const [first] = classifyLine([mate(2, 'white'), mate(1, 'black')]);
    expect(first?.category).toBe('blunder');
    expect(first?.tags).toEqual(['missed-mate', 'allows-mate', 'throws-away-advantage']);
    expect(first?.pointLoss).toBe(1);
  });

  it('trusts the engine’s first choice even if the next evaluation looks worse', () => {
    const [first] = classifyLine([mate(2, 'white'), cp(100)], { firstChoice: [1] });
    expect(first).toMatchObject({ category: 'best', playedIsBest: true, pointLoss: 0, tags: [] });
  });
});

describe('classifyGame: one legal move', () => {
  // White is in check from the rook on d1 and can only block with Re1.
  const FORCED = '6k1/6pp/8/8/8/8/4RPPP/3r2K1 w - - 0 1';

  it('is best and forced whatever the evaluations say', () => {
    expect(new Chess(FORCED).moves()).toEqual(['Re1']);
    const forced = gameFrom(['e2e1'], FORCED);
    const [only] = classifyGame({
      game: forced,
      positions: positionsFor(forced, [cp(300), cp(-500)]),
      opening: null,
    });
    expect(only).toEqual({
      ply: 1,
      category: 'best',
      pointLoss: 0,
      playedIsBest: true,
      best: { uci: 'e2e1', san: 'Re1' },
      tags: ['forced'],
    });
  });
});

describe('classifyGame: brilliant', () => {
  // The bishop sacrifice on h7 from brilliant.test.ts, with hand-built scores.
  const GREEK_GIFT = '5rk1/4qppp/4p3/4P3/8/3B1N2/5PPP/3Q2K1 w - - 0 1';
  const sacrifice = gameFrom(['d3h7'], GREEK_GIFT);

  it('upgrades the engine’s first choice when it is a sound sacrifice', () => {
    const [only] = classifyGame({
      game: sacrifice,
      positions: positionsFor(sacrifice, [cp(150), cp(150)], [1]),
      opening: null,
    });
    expect(only).toMatchObject({
      category: 'brilliant',
      tags: ['sacrifice'],
      playedIsBest: true,
      pointLoss: 0,
    });
  });

  it('can upgrade a move the ladder calls best although the engine preferred another', () => {
    const [only] = classifyGame({
      game: sacrifice,
      positions: positionsFor(sacrifice, [cp(150), cp(150)]),
      opening: null,
    });
    expect(only).toMatchObject({
      category: 'brilliant',
      tags: ['sacrifice'],
      playedIsBest: false,
      pointLoss: 0,
    });
  });

  it('does not upgrade a sacrifice that the ladder marks down', () => {
    // +150 -> +95 gives up 0.0459: good, and a good move is never brilliant.
    const [only] = classifyGame({
      game: sacrifice,
      positions: positionsFor(sacrifice, [cp(150), cp(95)]),
      opening: null,
    });
    expect(only).toMatchObject({ category: 'good', tags: [] });
  });

  it('does not upgrade a book move', () => {
    const [only] = classifyGame({
      game: sacrifice,
      positions: positionsFor(sacrifice, [cp(150), cp(150)], [1]),
      opening: { eco: 'A00', name: 'Test', lastBookPly: 1 },
    });
    expect(only).toMatchObject({ category: 'book', tags: [] });
  });
});

// Owner, 2026-11-15 (Fable review A1-05, threshold changed the same day): a move in the opening
// book that costs at least 1% and that the ladder calls a Mistake or Blunder gets that label, not
// Book. A book move the ladder calls only an Inaccuracy stays Book.
describe('classifyGame: book moves that are real errors', () => {
  it('labels a book move by the ladder when it is an error', () => {
    // 2...Nc6 (ply 4) is in the book and gives up 0.1868 (+30 -> +260).
    const results = classifyLine([cp(30), cp(30), cp(30), cp(30), cp(260)], { lastBookPly: 4 });
    expect(results.map((result) => result.category)).toEqual(['book', 'book', 'book', 'mistake']);
    expect(results[3]?.pointLoss).toBeCloseTo(0.1868, 4);
  });

  it('labels Mistake and Blunder, and keeps Book for an Inaccuracy', () => {
    const third = (after: number) =>
      classifyLine([cp(30), cp(30), cp(30), cp(after)], { lastBookPly: 3 })[2]?.category;
    expect(third(-56)).toBe('book'); // 0.0751: an Inaccuracy by the ladder
    expect(third(-90)).toBe('mistake'); // 0.1043
    expect(third(-300)).toBe('blunder'); // 0.2670
  });

  it('keeps Book for the largest Inaccuracy and labels the smallest Mistake', () => {
    // The ladder's step from Inaccuracy to Mistake is a loss of 0.10 (0.12 before 2026-11-17).
    const third = (after: number) =>
      classifyLine([cp(30), cp(30), cp(30), cp(after)], { lastBookPly: 3 })[2]?.category;
    expect(third(-84)).toBe('book'); // 0.0992
    expect(third(-85)).toBe('mistake'); // 0.1001
  });

  it('keeps the tags an error has', () => {
    // 2. Nf3 (ply 3) in the book turns +30 into -300 for White: from at least equal to losing.
    const [, , third] = classifyLine([cp(30), cp(30), cp(30), cp(-300)], { lastBookPly: 3 });
    expect(third).toMatchObject({ category: 'blunder', tags: ['throws-away-advantage'] });
  });

  it('keeps Book when the move costs less than 1%', () => {
    // +30 -> +32 for Black: 0.0017.
    const results = classifyLine([cp(30), cp(30), cp(30), cp(30), cp(32)], { lastBookPly: 4 });
    expect(results[3]).toMatchObject({ category: 'book', tags: [] });
  });

  it('keeps Book when the move costs 1% or more but the ladder does not call it an error', () => {
    // +30 -> +60 for Black: 0.0261 is Excellent; +30 -> +110: 0.0617 is Good.
    const fourth = (after: number) =>
      classifyLine([cp(30), cp(30), cp(30), cp(30), cp(after)], { lastBookPly: 4 })[3];
    expect(fourth(60)?.category).toBe('book');
    expect(fourth(110)?.category).toBe('book');
    expect(fourth(110)?.pointLoss).toBeGreaterThanOrEqual(0.01);
  });

  it('keeps Book for the engine’s first choice, whatever the scores do', () => {
    const results = classifyLine([cp(30), cp(30), cp(30), cp(30), cp(300)], {
      lastBookPly: 4,
      firstChoice: [4],
    });
    expect(results[3]?.category).toBe('book');
  });

  it('labels a real trap: 2. Nf3 in the Tennison Gambit (fixture HKl8S22m, app engine)', async () => {
    const trapGame = hkl8Game as GameRecord;
    const trapAnalysis = hkl8Lite as unknown as GameAnalysis;
    const book = await loadOpeningBook();
    const opening = findOpening(
      book,
      trapGame.moves.map((move) => move.fenAfter),
    );
    // 1. e4 d5 2. Nf3: still a named position, so all three moves are in the book.
    expect(opening).toMatchObject({ name: 'Zukertort Opening: Tennison Gambit', lastBookPly: 3 });
    const results = classifyGame({
      game: trapGame,
      positions: trapAnalysis.positions,
      opening,
    });
    // +59 -> -101 for White: 0.1389 of the expected points.
    expect(results.slice(0, 3).map((result) => result.category)).toEqual([
      'book',
      'book',
      'mistake',
    ]);
    expect(results[2]?.pointLoss).toBeCloseTo(0.1389, 4);
  });
});

describe('classifyGame: the game ends with the move', () => {
  it('calls a checkmating move best even when the engine’s first line was another move', () => {
    // 1. f3 e5 2. g4 Qh4#; the hand-built lines before the mate start with other moves.
    const foolsMate = gameFrom(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    const scores = [cp(0), cp(-100), cp(-100), mate(1, 'black'), over('black')];
    const results = classifyGame({
      game: foolsMate,
      positions: positionsFor(foolsMate, scores),
      opening: null,
    });
    expect(results[3]).toMatchObject({
      category: 'best',
      pointLoss: 0,
      playedIsBest: false,
      tags: [],
    });
    // 2. g4 allowed it: from -100 to mate in one.
    expect(results[2]).toMatchObject({ category: 'blunder', tags: ['allows-mate'] });
  });

  it('calls a checkmating first choice best, not great, even when nothing else was good', () => {
    // Same game; this time ...Qh4# is the engine's first line and the second line is level.
    const foolsMate = gameFrom(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    const beforeMate = foolsMate.moves[3]?.fenBefore ?? '';
    const positions = positionsFor(foolsMate, [
      cp(0),
      cp(-100),
      cp(-100),
      mate(1, 'black'),
      over('black'),
    ]);
    positions[3] = position(beforeMate, 3, [
      { score: mate(1, 'black'), uci: 'd8h4' },
      { score: cp(0) },
    ]);
    const results = classifyGame({ game: foolsMate, positions, opening: null });
    expect(results[3]).toMatchObject({ category: 'best', playedIsBest: true, tags: [] });
  });

  it('grades a move that stalemates on what was given up', () => {
    // Black, a queen up, plays ...Qf2 and it is stalemate.
    const stalemate = gameFrom(['g3f2'], '7k/8/8/8/8/6q1/8/7K b - - 0 1');
    const [only] = classifyGame({
      game: stalemate,
      positions: positionsFor(stalemate, [cp(-900), over(null)]),
      opening: null,
    });
    expect(only?.category).toBe('blunder');
    // Black held 0.9589 and keeps half a point; the position is drawn, not lost.
    expect(only?.pointLoss).toBeCloseTo(0.4589, 4);
    expect(only?.tags).toEqual([]);
  });
});

describe('classifyGame: miss', () => {
  // Black's 2...Nc6 is made a blunder (+30 -> +300), then White's 3. Bc4 lets it go.
  const before = [cp(30), cp(30), cp(30), cp(30)];

  it('calls the reply a miss when it only gives back what the opponent gave', () => {
    const results = classifyLine([...before, cp(300), cp(20), cp(20)]);
    expect(results[3]?.category).toBe('blunder'); // 2...Nc6 gives up 0.2146 (from 0.20)
    expect(results[4]?.category).toBe('miss');
    expect(results[4]?.tags).toEqual(['missed-win']);
    expect(results[4]?.pointLoss).toBeCloseTo(0.2233, 4);
  });

  it('keeps blunder when the reply loses more than the opponent gave', () => {
    // +300 -> -150: White ends up 0.1545 below where he stood before Black's mistake.
    const results = classifyLine([...before, cp(300), cp(-150), cp(-150)]);
    expect(results[4]?.category).toBe('blunder');
    expect(results[4]?.tags).toEqual([]);
  });

  it('adds the throws-away tag when the reply leaves the mover losing', () => {
    // +300 -> -300: from 0.7408 to 0.2592.
    const results = classifyLine([...before, cp(300), cp(-300), cp(-300)]);
    expect(results[4]?.category).toBe('blunder');
    expect(results[4]?.tags).toEqual(['throws-away-advantage']);
  });

  it('is not a miss when the opponent’s move was a book move that stays Book', () => {
    // 2...Nc6 in the book gives up 0.0261 (+30 -> +60): Excellent by the ladder, so Book.
    // 3. Bc4 then gives up 0.1806 (+60 -> -150): a Mistake, not a Miss.
    const results = classifyLine([...before, cp(60), cp(-150), cp(-150)], { lastBookPly: 4 });
    expect(results[3]?.category).toBe('book');
    expect(results[4]?.category).toBe('mistake');
  });

  it('counts a book move that is a real error as the opponent’s error (Fable A1-05)', () => {
    // 2...Nc6 in the book gives up 0.2145: a Blunder, so letting it go is a Miss.
    const results = classifyLine([...before, cp(300), cp(20), cp(20)], { lastBookPly: 4 });
    expect(results[3]?.category).toBe('blunder');
    expect(results[4]?.category).toBe('miss');
  });

  it('is not a miss when the opponent’s move was the engine’s first choice', () => {
    // The scores jump after 2...Nc6, but the engine itself chose that move: not an error.
    const results = classifyLine([...before, cp(300), cp(20), cp(20)], { firstChoice: [4] });
    expect(results[3]?.category).toBe('best');
    expect(results[4]?.category).toBe('blunder');
  });

  it('is not a miss when the mover had been better for a while', () => {
    // No mistake by Black on the move before: White simply lets +300 slip.
    const results = classifyLine([cp(300), cp(300), cp(300), cp(300), cp(300), cp(20), cp(20)]);
    expect(results[4]?.category).toBe('blunder');
    expect(results[4]?.tags).toEqual([]);
  });

  it('calls a forced mate that was handed over and not taken a miss with a missed mate', () => {
    // White is +100 throughout; 2...Nc6 allows mate in 2 (a blunder); 3. Bc4 goes back to +100.
    const steady = [cp(100), cp(100), cp(100), cp(100)];
    const results = classifyLine([...steady, mate(2, 'white'), cp(100), cp(100)]);
    expect(results[3]).toMatchObject({ category: 'blunder', tags: ['allows-mate'] });
    expect(results[4]?.category).toBe('miss');
    expect(results[4]?.tags).toEqual(['missed-mate']);
  });

  it('never calls the first move of a game a miss', () => {
    const [first] = classifyLine([cp(300), cp(0)]);
    expect(first?.category).toBe('blunder');
  });
});

describe('classifyMove: a sacrifice counts once (owner, 2026-11-15)', () => {
  // 9.Qd2 left the g5 bishop to ...hxg5; 9...Re8 declined; 10.O-O-O leaves it again.
  const BEFORE_9 = 'rnbq1rk1/pp2bpp1/2p2n1p/3p2B1/3P3P/2NB1N2/PPP2PP1/R2QK2R w KQ - 0 9';
  const BEFORE_10 = 'rnbqr1k1/pp2bpp1/2p2n1p/3p2B1/3P3P/2NB1N2/PPPQ1PP1/R3K2R w KQ - 2 10';
  const qd2 = moveFrom(BEFORE_9, 'd1d2', 17);
  const castle = moveFrom(BEFORE_10, 'e1c1', 19);
  const input = {
    move: castle,
    before: position(BEFORE_10, 18, [{ score: cp(-18), uci: 'e1c1' }, { score: cp(-64) }]),
    after: position(castle.fenAfter, 19, [{ score: cp(-21) }]),
    isBook: false,
  };

  it('does not call 10.O-O-O Brilliant when it knows 9.Qd2 came first', () => {
    expect(classifyMove({ ...input, ownPrevious: qd2 }).category).toBe('best');
  });

  it('would, without the mover’s previous move', () => {
    expect(classifyMove(input).category).toBe('brilliant');
  });
});

// Owner, 2026-11-15 (rules a and b): an error must cost at least 1% of the mover's win chance,
// and letting a short forced mate go while still well ahead is a Miss.
describe('classifyGame: an error costs at least 1%; a missed short mate is a Miss', () => {
  // The app's own analyses (Stockfish 17.1 lite, depth 18) of two fixture games.
  const lite = (folder: string) => {
    const dir = fileURLToPath(new URL(`../../../fixtures/${folder}/`, import.meta.url));
    const g = JSON.parse(readFileSync(`${dir}game.json`, 'utf8')) as GameRecord;
    const a = JSON.parse(readFileSync(`${dir}analysis-lite.json`, 'utf8')) as GameAnalysis;
    return classifyGame({ game: g, positions: a.positions, opening: a.opening });
  };

  // The scores of the app's earlier analysis of this game (+18.0, then White mates in 3); the
  // engine now searches every position from scratch and sees +9.3 there (a Mistake by the rules).
  it('calls 34...Bg7 Good: Black had 0.18% before it and allowed mate in 3 (was Mistake)', () => {
    const dir = fileURLToPath(new URL('../../../fixtures/lichess-f6WkG3uO/', import.meta.url));
    const g = JSON.parse(readFileSync(`${dir}game.json`, 'utf8')) as GameRecord;
    const move = g.moves[67]!;
    expect(move.san).toBe('Bg7');
    const result = classifyMove({
      move,
      before: position(move.fenBefore, 67, [
        { score: cp(1800), uci: 'h8h7' },
        { score: cp(1800), uci: 'h6g7' },
      ]),
      after: position(move.fenAfter, 68, [{ score: mate(3, 'white') }]),
      isBook: false,
    });
    expect(result.category).toBe('good');
  });

  it('calls 28...Qxg1+ a Miss: mate in 1 was there and Black is still well ahead', () => {
    const move = lite('lichess-HKl8S22m')[55]!;
    expect(move.ply).toBe(56);
    expect(move).toMatchObject({ category: 'miss', tags: ['missed-mate'] });
  });

  // Hand-built scores around a real first move: only the rules are under test.
  const missedMate = (mateIn: number, afterCp: number) => {
    const move = moveFrom(START_FEN, 'g1f3');
    return classifyMove({
      move,
      before: position(START_FEN, 0, [
        { score: mate(mateIn, 'white'), uci: 'e2e4' },
        { score: cp(0) },
      ]),
      after: position(move.fenAfter, 1, [{ score: cp(afterCp) }]),
      isBook: false,
    });
  };

  it('is a Miss with mate in 3 or less, when the mover keeps 72% or more', () => {
    expect(missedMate(3, 600)).toMatchObject({ category: 'miss', tags: ['missed-mate'] });
    expect(missedMate(1, 300)).toMatchObject({ category: 'miss' }); // 74%
  });

  it('is not a Miss for a longer mate, or when the edge drops below 72%', () => {
    expect(missedMate(4, 600).category).not.toBe('miss');
    expect(missedMate(2, 250).category).not.toBe('miss'); // 70.6%
  });

  it('is not a Miss when hardly anything was lost (under 1%)', () => {
    // +20 pawns after: 99.9%; the ladder's own Excellent stands.
    expect(missedMate(2, 2000).category).toBe('excellent');
  });

  it('turns an error that costs under 1% into Good', () => {
    // Already lost (-18 pawns), the move allows mate in 3: costs 0.18%.
    const move = moveFrom(START_FEN, 'g1f3');
    const result = classifyMove({
      move,
      before: position(START_FEN, 0, [{ score: cp(-1800), uci: 'e2e4' }, { score: cp(-1900) }]),
      after: position(move.fenAfter, 1, [{ score: mate(3, 'black') }]),
      isBook: false,
    });
    expect(result.category).toBe('good');
  });
});
