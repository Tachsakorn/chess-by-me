import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GameAnalysis, GameMove, GameRecord, PositionEval, Score } from '@/contract';
import { reviewMove } from './buildAnalysis';
import { loadOpeningBook, type OpeningBook } from './classify';
import { cp, gameFrom, mate, moveFrom, position, positionsFor } from './classify/testSupport';
import { compareWithGameMove, reviewTriedMove, type TriedLine } from './tryMove';

const read = <T>(name: string): T =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../fixtures/lichess-LAGvRNey/${name}`, import.meta.url)),
      'utf8',
    ),
  ) as T;

// A real game with the app's own analysis (Stockfish 17.1 lite, depth 18). Its 16th half-move
// is 8... d5, where the engine preferred 8... Nh6.
const game = read<GameRecord>('game.json');
const analysis = read<GameAnalysis>('analysis-lite.json');

let book: OpeningBook;
beforeAll(async () => {
  book = await loadOpeningBook();
});

/** The moves of a line played from the game's position `from`, numbered on from the game. */
function lineMoves(record: GameRecord, from: number, ucis: readonly string[]): GameMove[] {
  const moves: GameMove[] = [];
  let fen = from === 0 ? record.initialFen : record.moves[from - 1]!.fenAfter;
  for (const uci of ucis) {
    const move = moveFrom(fen, uci, from + moves.length + 1);
    moves.push(move);
    fen = move.fenAfter;
  }
  return moves;
}

/** An evaluation of the position after `move`: one score, the first line any legal move. */
const after = (move: GameMove, score: Score, firstUci?: string): PositionEval =>
  position(move.fenAfter, move.ply, [{ score, uci: firstUci }]);

function fixtureLine(ucis: readonly string[], evals: (PositionEval | undefined)[]): TriedLine {
  return {
    game,
    positions: analysis.positions,
    opening: analysis.opening,
    from: 15,
    moves: lineMoves(game, 15, ucis),
    evals,
  };
}

describe('reviewTriedMove', () => {
  it('has nothing to say until the position after the move is evaluated', () => {
    expect(reviewTriedMove(fixtureLine(['g4h6'], [undefined]), 0, book)).toBeNull();
  });

  it("reviews the first move against the game analysis's evaluation before it", () => {
    const moves = lineMoves(game, 15, ['g4h6']);
    const evaluated = after(moves[0]!, cp(124));
    const review = reviewTriedMove(fixtureLine(['g4h6'], [evaluated]), 0, book)!;
    // 8... Nh6 is the engine's first choice in the game's own evaluation of that position.
    expect(review).toMatchObject({
      ply: 16,
      category: 'best',
      playedIsBest: true,
      pointLoss: 0,
      best: { uci: 'g4h6', san: 'Nh6' },
    });
  });

  it('labels the move with the same function as the game analysis, rule for rule', () => {
    const moves = lineMoves(game, 15, ['g4f2']);
    const evaluated = after(moves[0]!, cp(520));
    const review = reviewTriedMove(fixtureLine(['g4f2'], [evaluated]), 0, book);
    // The same input, classified directly.
    const direct = reviewMove({
      move: moves[0]!,
      before: analysis.positions[15]!,
      after: evaluated,
      isBook: false,
      ownPrevious: game.moves[13]!,
      previous: { move: game.moves[14]!, before: analysis.positions[14]!, isBook: false },
    });
    expect(review).toEqual(direct);
    expect(review!.category).toBe('blunder');
  });

  it("reviews a later move against the line's own evaluation, not the game's", () => {
    // 8... Nh6 9. Bxh6: before = the line's evaluation after 8... Nh6.
    const moves = lineMoves(game, 15, ['g4h6', 'c1h6']);
    const first = position(moves[0]!.fenAfter, 16, [{ score: cp(124), uci: 'c1h6' }]);
    const second = after(moves[1]!, cp(130));
    const review = reviewTriedMove(fixtureLine(['g4h6', 'c1h6'], [first, second]), 1, book)!;
    expect(review).toMatchObject({ ply: 17, playedIsBest: true, category: 'best' });

    // Another 9th move, far worse than what the line's evaluation promised White.
    const other = lineMoves(game, 15, ['g4h6', 'a2a3']);
    const worse = reviewTriedMove(
      fixtureLine(['g4h6', 'a2a3'], [first, after(other[1]!, cp(-200))]),
      1,
      book,
    )!;
    expect(worse.playedIsBest).toBe(false);
    expect(worse.category).toBe('blunder');
    expect(worse.best).toEqual({ uci: 'c1h6', san: 'Bxh6' });
  });

  it('waits for the evaluation before a later move as well', () => {
    const moves = lineMoves(game, 15, ['g4h6', 'c1h6']);
    const line = fixtureLine(['g4h6', 'c1h6'], [undefined, after(moves[1]!, cp(130))]);
    expect(reviewTriedMove(line, 1, book)).toBeNull();
  });

  it('calls a move that stays in the opening book Book, and one that leaves it not', () => {
    // 1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4: the game. From move 3, try 3. Bb5 (Ruy Lopez).
    const ruy = lineMoves(game, 4, ['f1b5']);
    const inBook: TriedLine = {
      game,
      positions: analysis.positions,
      opening: analysis.opening,
      from: 4,
      moves: ruy,
      evals: [after(ruy[0]!, cp(20))],
    };
    expect(reviewTriedMove(inBook, 0, book)!.category).toBe('book');

    // 3. Ke2 is in no book: labelled by the ladder.
    const king = lineMoves(game, 4, ['e1e2']);
    const offBook: TriedLine = { ...inBook, moves: king, evals: [after(king[0]!, cp(-80))] };
    expect(reviewTriedMove(offBook, 0, book)!.category).not.toBe('book');
  });

  it('gives a Miss when the tried move lets go what the opponent just gave away', () => {
    // 1. e4 e5 2. Qh5 Ke7?? gives mate in one (3. Qxe5#); White tries 3. Nf3 instead.
    const record = gameFrom(['e2e4', 'e7e5', 'd1h5', 'e8e7', 'h5e5']);
    const positions = positionsFor(
      record,
      [cp(30), cp(30), cp(30), cp(0), mate(1, 'white'), { kind: 'over', winner: 'white' }],
      [5], // the engine's first choice before 3. Qxe5# is that move
    );
    const moves = lineMoves(record, 4, ['g1f3']);
    const line: TriedLine = {
      game: record,
      positions,
      opening: null,
      from: 4,
      moves,
      // Level again: the mate is gone, and White is no worse than before Black's blunder.
      evals: [after(moves[0]!, cp(30))],
    };
    const review = reviewTriedMove(line, 0, book)!;
    expect(review.category).toBe('miss');
    expect(review.tags).toContain('missed-mate');
  });
});

describe('compareWithGameMove', () => {
  const moves = lineMoves(game, 15, ['g4h6']);
  // After the game's 8... d5 the app's analysis says +2.0 for White; Black is the mover.
  const gameAfter = analysis.positions[16]!;

  it('is better when the mover keeps clearly more than with the game move', () => {
    expect(gameAfter.score).toEqual({ kind: 'cp', value: 202 });
    expect(compareWithGameMove(fixtureLine(['g4h6'], [after(moves[0]!, cp(124))]))).toBe('better');
  });

  it('is worse when the mover keeps clearly less', () => {
    expect(compareWithGameMove(fixtureLine(['g4h6'], [after(moves[0]!, cp(420))]))).toBe('worse');
  });

  it('is the same within one point in a hundred of the win chance', () => {
    expect(compareWithGameMove(fixtureLine(['g4h6'], [after(moves[0]!, cp(205))]))).toBe('same');
  });

  it('has nothing to compare while the move is unevaluated or the game has no move there', () => {
    expect(compareWithGameMove(fixtureLine(['g4h6'], [undefined]))).toBeNull();
    const record = gameFrom(['e2e4', 'e7e5']);
    const positions = positionsFor(record, [cp(30), cp(30), cp(30)]);
    const extra = lineMoves(record, 2, ['g1f3']);
    expect(
      compareWithGameMove({
        game: record,
        positions,
        opening: null,
        from: 2,
        moves: extra,
        evals: [after(extra[0]!, cp(30))],
      }),
    ).toBeNull();
  });
});
