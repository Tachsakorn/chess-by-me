/**
 * Puts every move of an evaluated game into its category.
 *
 * The order of decisions follows WintrChess (GPL-3.0, WintrCat/wintrchess at
 * commit d145b2096895, shared/src/lib/reporter/classify.ts): forced move,
 * checkmate, the engine's first choice with its upgrades to Great and
 * Brilliant, otherwise the ladder. Three things are this project's own: book
 * moves come first (the contract ties `book` to the opening's last book ply;
 * since 2026-11-15 a book move that is a real error keeps the error, see
 * `bookError`), Miss is added after the ladder, and the tags. The code is written for this
 * project's types; nothing is copied. See docs/sources/classification.md.
 */
import { Chess } from 'chess.js';
import type {
  Color,
  GameMove,
  GameRecord,
  MoveCategory,
  MoveReview,
  MoveTag,
  OpeningInfo,
  PositionEval,
  Score,
} from '@/contract';
import { isBrilliant } from './brilliant';
import { categoryByRules, type LadderCategory } from './categories';
import { expectedPointsFor, pointLoss, AT_LEAST_EQUAL_EXPECTED } from './expectedPoints';
import { isGreat } from './great';
import { isMiss } from './miss';

/** A move review without the accuracy, which another package computes. */
export type MoveClassification = Omit<MoveReview, 'accuracy'>;

// "At least equal" now lives with the expected points; still exported from here.
export { AT_LEAST_EQUAL_EXPECTED };

/**
 * "Losing" for the throws-away-advantage tag: a blunder's worth (0.22) below a
 * level game. About -270 centipawns, or any forced mate against the mover.
 */
export const LOSING_EXPECTED = 0.28;

/**
 * An error (Inaccuracy, Mistake, Miss, Blunder) must cost the mover at least this much of their
 * expected points; one that costs less is Good (owner, 2026-11-15, rule a). The same 1% as the
 * ladder's step from Best.
 */
export const ERROR_MIN_LOSS = 0.01;

/** A forced mate this short that the mover lets go is a Miss (owner, 2026-11-15, rule b)... */
export const MISSED_MATE_MAX = 3;
/** ...when the mover still keeps at least this much: the other side of LOSING_EXPECTED. */
export const STILL_AHEAD_EXPECTED = 1 - LOSING_EXPECTED;

/** The order tags are listed in. */
const TAG_ORDER: readonly MoveTag[] = [
  'sacrifice',
  'only-good-move',
  'forced',
  'missed-mate',
  'missed-win',
  'allows-mate',
  'throws-away-advantage',
];

export interface ClassifyMoveInput {
  move: GameMove;
  /** Evaluation of the position the move was played in. */
  before: PositionEval;
  /** Evaluation of the position the move led to. */
  after: PositionEval;
  /** True for the moves up to the opening's last book ply. */
  isBook: boolean;
  /**
   * The opponent's move just before this one and the evaluation of the
   * position it was played in. Needed to recognise a Miss; without it the move
   * is never a Miss.
   */
  previous?: { move: GameMove; before: PositionEval; isBook: boolean } | null;
  /**
   * The mover's own previous move (two plies back). Needed so that leaving the same piece
   * hanging again is not a second Brilliant; without it every such move can count.
   */
  ownPrevious?: GameMove | null;
}

/** One category per move of the game, in order. */
export function classifyGame(input: {
  game: GameRecord;
  positions: readonly PositionEval[];
  opening: OpeningInfo | null;
}): MoveClassification[] {
  const { game, positions, opening } = input;
  const needed = game.moves.length + 1;
  if (positions.length !== needed) {
    throw new RangeError(
      `classifyGame needs ${needed} positions for ${game.moves.length} moves, got ${positions.length}`,
    );
  }
  const lastBookPly = opening?.lastBookPly ?? 0;

  return game.moves.map((move, index) => {
    const input = moveInputAt(game, positions, index, lastBookPly);
    if (!input) throw new RangeError(`no evaluation around move ${move.ply}`);
    return classifyMove(input);
  });
}

/**
 * Everything `classifyMove` needs for the move at `index`, from the positions known so far;
 * null until the positions on both sides of it are known. Shared by the finished analysis and
 * the review streamed while analysing, so the two always agree (Fable review A1-02).
 */
export function moveInputAt(
  game: GameRecord,
  positions: readonly PositionEval[],
  index: number,
  lastBookPly: number,
): ClassifyMoveInput | null {
  const move = game.moves[index];
  const before = positions[index];
  const after = positions[index + 1];
  if (!move || !before || !after) return null;
  const previousMove = game.moves[index - 1];
  const previousBefore = positions[index - 1];
  return {
    move,
    before,
    after,
    isBook: move.ply <= lastBookPly,
    ownPrevious: game.moves[index - 2] ?? null,
    previous:
      previousMove && previousBefore
        ? {
            move: previousMove,
            before: previousBefore,
            isBook: previousMove.ply <= lastBookPly,
          }
        : null,
  };
}

/** The category, point loss and tags of one move. */
export function classifyMove(input: ClassifyMoveInput): MoveClassification {
  const { move, before, after } = input;
  const mover = move.color;
  const first = before.lines[0];
  const firstUci = first?.uci[0];
  const firstSan = first?.san[0];
  const best =
    firstUci !== undefined && firstSan !== undefined ? { uci: firstUci, san: firstSan } : null;
  const playedIsBest = best?.uci === move.uci;
  const result = (
    category: MoveCategory,
    loss: number,
    tags: readonly MoveTag[],
  ): MoveClassification => ({
    ply: move.ply,
    category,
    pointLoss: loss,
    playedIsBest,
    best,
    tags: TAG_ORDER.filter((tag) => tags.includes(tag)),
  });

  const rawLoss = playedIsBest ? 0 : pointLoss(before.score, after.score, mover);
  if (input.isBook) {
    const error = bookError(move, before, after);
    if (error === null) return result('book', rawLoss, []);
    const tags = mateTags(before.score, after.score, mover);
    if (throwsAway(error, before.score, after.score, mover)) tags.push('throws-away-advantage');
    return result(error, rawLoss, tags);
  }
  if (isForced(move)) return result('best', 0, ['forced']);
  if (deliversCheckmate(move)) return result('best', 0, []);

  const context = { move, before, after, afterOwnPrevious: input.ownPrevious?.fenAfter };
  if (playedIsBest) {
    const tags: MoveTag[] = [];
    let category: MoveCategory = 'best';
    if (isGreat(context)) {
      category = 'great';
      tags.push('only-good-move');
    }
    if (isBrilliant(context)) {
      category = 'brilliant';
      tags.push('sacrifice');
    }
    return result(category, 0, tags);
  }

  const byRules = categoryByRules(before.score, after.score, mover);
  // The ladder can call a move Best although the engine preferred another one;
  // such a move can still be Brilliant, but never Great.
  if (byRules === 'best' && isBrilliant(context)) {
    return result('brilliant', rawLoss, ['sacrifice']);
  }

  const hadMate = isMateFor(before.score, mover);
  const tags = mateTags(before.score, after.score, mover);

  const moverBefore = expectedPointsFor(before.score, mover);
  const moverAfter = expectedPointsFor(after.score, mover);
  const previous = input.previous;
  const missed =
    previous !== null &&
    previous !== undefined &&
    isMiss({
      category: byRules,
      opponentPrevious: errorByRules(previous.move, previous.before, before, previous.isBook),
      moverBeforeOpponentMove: expectedPointsFor(previous.before.score, mover),
      moverBefore,
      moverAfter,
    });
  // Rule b: a forced mate in MISSED_MATE_MAX or less let go while still well ahead, whatever the
  // opponent did before.
  const missedShortMate =
    before.score.kind === 'mate' &&
    before.score.winner === mover &&
    before.score.moves <= MISSED_MATE_MAX &&
    !isMateFor(after.score, mover) &&
    moverAfter >= STILL_AHEAD_EXPECTED;
  // Rule a: no error, a Miss included, unless it costs at least ERROR_MIN_LOSS.
  const costsSomething = rawLoss >= ERROR_MIN_LOSS;
  if ((missed || missedShortMate) && costsSomething) {
    return result('miss', rawLoss, [hadMate ? 'missed-mate' : 'missed-win']);
  }
  if (!costsSomething && byRules !== 'best' && byRules !== 'excellent' && byRules !== 'good') {
    return result('good', rawLoss, tags);
  }

  if (throwsAway(byRules, before.score, after.score, mover)) tags.push('throws-away-advantage');
  return result(byRules, rawLoss, tags);
}

/**
 * The ladder's errors a book move can be labelled with instead of Book: Mistake and Blunder only.
 * A book move the ladder calls an Inaccuracy stays Book (owner, 2026-11-15: sound gambits such as
 * the King's Gambit lose a little by the engine and should not be marked).
 */
type BookError = Extract<LadderCategory, 'mistake' | 'blunder'>;
const BOOK_ERRORS: readonly LadderCategory[] = ['mistake', 'blunder'];

/**
 * The error a move in the opening book really is, or null when it stays Book (owner,
 * 2026-11-15, Fable review A1-05): the ladder must call it a Mistake or a Blunder, and it must
 * cost at least ERROR_MIN_LOSS, the floor every other error has. The engine's first choice and
 * the only legal move are never errors.
 */
export function bookError(
  move: GameMove,
  before: PositionEval,
  after: PositionEval,
): BookError | null {
  if (before.lines[0]?.uci[0] === move.uci) return null;
  if (pointLoss(before.score, after.score, move.color) < ERROR_MIN_LOSS) return null;
  const byRules = categoryByRules(before.score, after.score, move.color);
  if (!BOOK_ERRORS.includes(byRules)) return null;
  if (isForced(move)) return null;
  return byRules as BookError;
}

/** The missed-mate and allows-mate tags, which do not depend on the category. */
function mateTags(before: Score, after: Score, mover: Color): MoveTag[] {
  const tags: MoveTag[] = [];
  if (isMateFor(before, mover) && !isMateFor(after, mover)) tags.push('missed-mate');
  const opponent: Color = mover === 'white' ? 'black' : 'white';
  if (isMateFor(after, opponent) && !isMateFor(before, opponent)) tags.push('allows-mate');
  return tags;
}

/** A Mistake or Blunder that takes the mover from at least equal to losing. */
function throwsAway(category: MoveCategory, before: Score, after: Score, mover: Color): boolean {
  return (
    (category === 'mistake' || category === 'blunder') &&
    expectedPointsFor(before, mover) >= AT_LEAST_EQUAL_EXPECTED &&
    expectedPointsFor(after, mover) <= LOSING_EXPECTED
  );
}

/**
 * What the ladder calls a move, or null when the ladder is not what decides
 * it: a forced move, a checkmate, the engine's first choice, or a book move
 * that stays Book. A book move labelled as an error counts as that error.
 */
function errorByRules(
  move: GameMove,
  before: PositionEval,
  after: PositionEval,
  isBook: boolean,
): LadderCategory | null {
  if (isBook) return bookError(move, before, after);
  if (isForced(move) || deliversCheckmate(move)) return null;
  if (before.lines[0]?.uci[0] === move.uci) return null;
  return categoryByRules(before.score, after.score, move.color);
}

function isForced(move: GameMove): boolean {
  return new Chess(move.fenBefore).moves().length <= 1;
}

function deliversCheckmate(move: GameMove): boolean {
  return new Chess(move.fenAfter).isCheckmate();
}

/** A forced mate for `color`, or a game `color` has already won. */
function isMateFor(score: Score, color: Color): boolean {
  return (score.kind === 'mate' || score.kind === 'over') && score.winner === color;
}
