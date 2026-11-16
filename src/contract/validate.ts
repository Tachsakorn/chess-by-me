import {
  CONTRACT_VERSION,
  MOVE_CATEGORIES,
  type Color,
  type GameAnalysis,
  type GameRecord,
  type MoveCategory,
  type PlayerSummary,
  type Score,
} from './types';

/** The categories a move listed in `opening.errorPlies` may have. */
const BOOK_ERRORS: readonly MoveCategory[] = ['inaccuracy', 'mistake', 'blunder'];

/**
 * Checks that an analysis obeys the contract's rules and matches its game.
 * Returns a list of problems in plain English; an empty list means valid.
 * Used by tests on every fixture and on the real analysis output.
 */
export function validateGameAnalysis(analysis: GameAnalysis, game: GameRecord): string[] {
  const problems: string[] = [];
  const plies = game.moves.length;

  if (analysis.contractVersion !== CONTRACT_VERSION) {
    problems.push(
      `contractVersion is ${String(analysis.contractVersion)}, expected ${CONTRACT_VERSION}`,
    );
  }
  if (
    analysis.rulesVersion !== undefined &&
    !(Number.isInteger(analysis.rulesVersion) && analysis.rulesVersion >= 1)
  ) {
    problems.push(`rulesVersion is ${String(analysis.rulesVersion)}, expected a whole number >= 1`);
  }
  if (analysis.gameId !== game.id) {
    problems.push(`gameId "${analysis.gameId}" does not match game "${game.id}"`);
  }
  if (analysis.positions.length !== plies + 1) {
    problems.push(`expected ${plies + 1} positions, got ${analysis.positions.length}`);
  }
  if (analysis.moves.length !== plies) {
    problems.push(`expected ${plies} move reviews, got ${analysis.moves.length}`);
  }

  analysis.positions.forEach((position, index) => {
    const at = `position ${index}`;
    if (position.ply !== index) problems.push(`${at}: ply is ${position.ply}`);
    const expectedFen = index === 0 ? game.initialFen : game.moves[index - 1]?.fenAfter;
    if (expectedFen !== undefined && position.fen !== expectedFen) {
      problems.push(`${at}: fen does not match the game`);
    }
    if (!inRange(position.whiteExpected, 0, 1)) {
      problems.push(`${at}: whiteExpected ${position.whiteExpected} is outside 0..1`);
    }
    problems.push(...scoreProblems(position.score).map((p) => `${at}: ${p}`));

    if (position.score.kind === 'over') {
      if (position.lines.length > 0) problems.push(`${at}: game is over but lines are present`);
      if (position.source !== 'rules')
        problems.push(`${at}: game is over but source is not "rules"`);
      if (position.depth !== 0) problems.push(`${at}: game is over but depth is not 0`);
    } else {
      if (position.lines.length === 0) problems.push(`${at}: no engine lines`);
      if (position.depth < 1) problems.push(`${at}: depth must be at least 1`);
    }
    position.lines.forEach((line, lineIndex) => {
      const lineAt = `${at} line ${lineIndex + 1}`;
      if (line.rank !== lineIndex + 1) problems.push(`${lineAt}: rank is ${line.rank}`);
      if (line.uci.length === 0) problems.push(`${lineAt}: empty line`);
      if (line.uci.length !== line.san.length)
        problems.push(`${lineAt}: uci and san differ in length`);
      problems.push(...scoreProblems(line.score).map((p) => `${lineAt}: ${p}`));
      if (line.score.kind === 'over')
        problems.push(`${lineAt}: a line cannot have an "over" score`);
    });
  });

  const lastBookPly = analysis.opening?.lastBookPly ?? 0;
  if (analysis.opening && !inRange(lastBookPly, 1, plies)) {
    problems.push(`opening.lastBookPly ${lastBookPly} is outside 1..${plies}`);
  }
  const errorPlies = analysis.opening?.errorPlies ?? [];
  const errorPliesInOrder = errorPlies.every(
    (ply, index) =>
      Number.isInteger(ply) &&
      ply >= 1 &&
      ply <= lastBookPly &&
      (index === 0 || ply > (errorPlies[index - 1] ?? 0)),
  );
  if (!errorPliesInOrder) {
    problems.push('opening.errorPlies must be increasing whole plies within 1..lastBookPly');
  }

  analysis.moves.forEach((review, index) => {
    const at = `move ${index + 1}`;
    if (review.ply !== index + 1) problems.push(`${at}: ply is ${review.ply}`);
    if (!MOVE_CATEGORIES.includes(review.category)) {
      problems.push(`${at}: unknown category "${String(review.category)}"`);
    }
    if (!inRange(review.pointLoss, 0, 1))
      problems.push(`${at}: pointLoss ${review.pointLoss} is outside 0..1`);
    if (!inRange(review.accuracy, 0, 100))
      problems.push(`${at}: accuracy ${review.accuracy} is outside 0..100`);
    const isBook = review.category === 'book';
    const listedAsError = errorPlies.includes(review.ply);
    if (listedAsError) {
      if (!BOOK_ERRORS.includes(review.category)) {
        problems.push(
          `${at}: opening.errorPlies lists it, so it must be an inaccuracy, mistake or blunder`,
        );
      }
    } else if (isBook !== review.ply <= lastBookPly) {
      problems.push(`${at}: "book" must be used for exactly the moves up to opening.lastBookPly`);
    }
    const played = game.moves[index];
    if (review.best && played && review.playedIsBest !== (review.best.uci === played.uci)) {
      problems.push(`${at}: playedIsBest disagrees with best.uci`);
    }
  });

  problems.push(...summaryProblems('white', analysis.white, analysis, game));
  problems.push(...summaryProblems('black', analysis.black, analysis, game));

  return problems;
}

function summaryProblems(
  color: Color,
  summary: PlayerSummary,
  analysis: GameAnalysis,
  game: GameRecord,
): string[] {
  const problems: string[] = [];
  if (!inRange(summary.accuracy, 0, 100)) {
    problems.push(`${color}: accuracy ${summary.accuracy} is outside 0..100`);
  }
  const range = summary.estimatedRating;
  if (range) {
    if (!Number.isInteger(range.low) || !Number.isInteger(range.high)) {
      problems.push(`${color}: estimatedRating bounds must be whole numbers`);
    }
    if (range.low >= range.high) {
      problems.push(`${color}: estimatedRating must be a range with low < high`);
    }
  }
  const actual = emptyCounts();
  analysis.moves.forEach((review, index) => {
    if (game.moves[index]?.color === color && MOVE_CATEGORIES.includes(review.category)) {
      actual[review.category] += 1;
    }
  });
  for (const category of MOVE_CATEGORIES) {
    if (summary.counts[category] !== actual[category]) {
      problems.push(
        `${color}: counts.${category} is ${String(summary.counts[category])}, moves show ${actual[category]}`,
      );
    }
  }
  return problems;
}

function scoreProblems(score: Score): string[] {
  switch (score.kind) {
    case 'cp':
      return Number.isFinite(score.value) ? [] : ['cp score is not a finite number'];
    case 'mate':
      return Number.isInteger(score.moves) && score.moves >= 1
        ? []
        : ['mate score needs moves >= 1'];
    case 'over':
      return [];
  }
}

export function emptyCounts(): Record<MoveCategory, number> {
  return {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    miss: 0,
    blunder: 0,
  };
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}
