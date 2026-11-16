import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { MoveCategory, MoveTag, PositionEval } from '@/contract';
import fixtureJson from './__fixtures__/special-moves.json';
import { classifyMove, type MoveClassification } from './classifyGame';
import { moveFrom } from './testSupport';

/**
 * Real game moments with real engine output: see __fixtures__/README.md for where
 * each one comes from. This file first checks the fixture itself (every position
 * loads, every move is legal, the engine output belongs to the right positions),
 * then pins the category the method gives each moment.
 */
interface SpecialMoment {
  id: string;
  kind: 'brilliant-sacrifice' | 'only-move' | 'missed-win' | 'quiet-best';
  source: { game: string; movesFrom: string; move: string };
  expected: { category: string; basis: string };
  movesBefore: string[];
  previous?: { fenBefore: string; moveUci: string; moveSan: string };
  fenBefore: string;
  moveUci: string;
  moveSan: string;
  evals: { previousBefore?: PositionEval; before: PositionEval; after: PositionEval };
}

const specialMoves = fixtureJson as unknown as {
  engine: { name: string; version: string; variant: string; depth: number; multiPv: number };
  moments: SpecialMoment[];
};

function play(fen: string, uci: string): { san: string; fenAfter: string } {
  const board = new Chess(fen);
  const move = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return { san: move.san, fenAfter: board.fen() };
}

/** Problems with one moment, in plain words; empty when it is sound. */
function momentProblems(moment: SpecialMoment, depth: number): string[] {
  const problems: string[] = [];
  const replay = new Chess();
  try {
    for (const san of moment.movesBefore) replay.move(san);
  } catch {
    return ['movesBefore holds an illegal move'];
  }
  const lineEnd = moment.previous?.fenBefore ?? moment.fenBefore;
  if (replay.fen() !== lineEnd) problems.push('movesBefore do not lead to the first position');

  if (moment.previous) {
    try {
      const previous = play(moment.previous.fenBefore, moment.previous.moveUci);
      if (previous.fenAfter !== moment.fenBefore) problems.push('previous move misses fenBefore');
      if (previous.san !== moment.previous.moveSan) problems.push('previous.moveSan is wrong');
    } catch {
      problems.push('previous move is illegal');
    }
    if (!moment.evals.previousBefore) problems.push('no engine output before the previous move');
  }

  let fenAfter: string | null = null;
  try {
    const played = play(moment.fenBefore, moment.moveUci);
    fenAfter = played.fenAfter;
    if (played.san !== moment.moveSan) problems.push('moveSan is wrong');
  } catch {
    problems.push('the move is illegal');
  }

  const expectedFens: Array<[string, PositionEval | undefined, string | null]> = [
    ['previousBefore', moment.evals.previousBefore, moment.previous?.fenBefore ?? null],
    ['before', moment.evals.before, moment.fenBefore],
    ['after', moment.evals.after, fenAfter],
  ];
  for (const [name, position, fen] of expectedFens) {
    if (!position) continue;
    if (position.fen !== fen) problems.push(`${name}: engine output is for another position`);
    if (position.score.kind === 'over') continue;
    if (position.source !== 'engine') problems.push(`${name}: source is not the engine`);
    if (position.depth !== depth) problems.push(`${name}: depth is ${position.depth}`);
    const first = position.lines[0];
    if (!first) problems.push(`${name}: no engine line`);
    else if (JSON.stringify(first.score) !== JSON.stringify(position.score)) {
      problems.push(`${name}: the position score is not the first line's score`);
    }
  }
  return problems;
}

describe('special-moves fixture', () => {
  it('was produced by Stockfish 17.1 (full build) at depth 18 with two lines', () => {
    expect(specialMoves.engine).toMatchObject({
      name: 'Stockfish',
      version: '17.1',
      variant: 'full',
      depth: 18,
      multiPv: 2,
    });
  });

  it('holds the mix of moments the plan asks for', () => {
    const count = (kind: SpecialMoment['kind']) =>
      specialMoves.moments.filter((moment) => moment.kind === kind).length;
    expect(specialMoves.moments.length).toBeGreaterThanOrEqual(12);
    expect(count('brilliant-sacrifice')).toBeGreaterThanOrEqual(4);
    expect(count('only-move')).toBeGreaterThanOrEqual(3);
    expect(count('missed-win')).toBeGreaterThanOrEqual(3);
    expect(count('quiet-best')).toBeGreaterThanOrEqual(2);
    expect(new Set(specialMoves.moments.map((moment) => moment.id)).size).toBe(
      specialMoves.moments.length,
    );
  });

  it.each(specialMoves.moments.map((moment) => [moment.id, moment] as const))(
    '%s: positions load, moves are legal, engine output matches the positions',
    (_id, moment) => {
      expect(momentProblems(moment, specialMoves.engine.depth)).toEqual([]);
    },
  );

  it('the checker itself notices a broken moment', () => {
    const sound = specialMoves.moments[0];
    if (!sound) throw new Error('fixture is empty');
    expect(momentProblems({ ...sound, moveUci: 'a1a8' }, 18)).toContain('the move is illegal');
    expect(momentProblems({ ...sound, movesBefore: sound.movesBefore.slice(1) }, 18)).toEqual([
      'movesBefore holds an illegal move',
    ]);
    expect(
      momentProblems(
        { ...sound, evals: { ...sound.evals, before: { ...sound.evals.before, depth: 12 } } },
        18,
      ),
    ).toContain('before: depth is 12');
  });
});

// ---------------------------------------------------------------------------
// What the method gives each moment
// ---------------------------------------------------------------------------

function classifyMoment(moment: SpecialMoment, withPrevious = true): MoveClassification {
  const ply = moment.evals.before.ply + 1;
  const previous =
    withPrevious && moment.previous && moment.evals.previousBefore
      ? {
          move: moveFrom(moment.previous.fenBefore, moment.previous.moveUci, ply - 1),
          before: moment.evals.previousBefore,
          isBook: false,
        }
      : null;
  return classifyMove({
    move: moveFrom(moment.fenBefore, moment.moveUci, ply),
    before: moment.evals.before,
    after: moment.evals.after,
    isBook: false,
    previous,
  });
}

/**
 * The category and tags the method gives each moment. They were worked out by
 * hand from the stored engine output and the rules BEFORE the classifier was run
 * on the moments (the reasoning is in docs/sources/classification.md). They
 * follow the method, not the move's reputation: `reputation` repeats what the
 * fixture says the move is known for, so the disagreements stay visible.
 */
const METHOD: ReadonlyArray<{
  id: string;
  reputation: string;
  category: MoveCategory;
  tags: MoveTag[];
}> = [
  {
    // First choice; the second choice gives up 0.22; queen and knight stay en prise.
    id: 'byrne-fischer-1956-17b-Be6',
    reputation: 'brilliant',
    category: 'brilliant',
    tags: ['sacrifice', 'only-good-move'],
  },
  {
    // First choice, with the engine giving White slightly worse afterwards (-30, expected
    // 0.474). Since 2026-11-15 (owner) Brilliant allows down to 0.455, so the rook left to be
    // taken makes it Brilliant; Great still needs 0 or better. Was 'best' before.
    id: 'kasparov-topalov-1999-24w-Rxd4',
    reputation: 'brilliant',
    category: 'brilliant',
    tags: ['sacrifice'],
  },
  {
    // First choice, and the queen can be taken three ways. But before the move the
    // queen (on c3) AND the rook on h3 were en prise; after it the g-pawn is pinned
    // and can no longer take the rook, so fewer pieces hang than before, and that is
    // the method's sign of a piece moved to safety. Not an only move either: the
    // second choice gives up only 0.03. (My hand-worked expectation said brilliant;
    // it had missed the pin. This entry was corrected after tracing the rule.)
    id: 'levitsky-marshall-1912-23b-Qg3',
    reputation: 'brilliant',
    category: 'best',
    tags: [],
  },
  {
    // First choice; the bishop can be taken by the g-pawn. The second choice gives up only 0.04.
    id: 'topalov-shirov-1998-47b-Bh3',
    reputation: 'brilliant',
    category: 'brilliant',
    tags: ['sacrifice'],
  },
  {
    // First choice; the knight it takes was defended, the second choice gives up
    // 0.12, and queen and rook stay en prise.
    id: 'rotlewi-rubinstein-1907-22b-Rxc3',
    reputation: 'brilliant',
    category: 'brilliant',
    tags: ['sacrifice', 'only-good-move'],
  },
  {
    // Known as an only move (the second choice gives up 0.53); it also leaves the
    // bishop to the queen, so the method goes one step further.
    id: 'kasparov-topalov-1999-36w-Bf1',
    reputation: 'great',
    category: 'brilliant',
    tags: ['sacrifice', 'only-good-move'],
  },
  {
    // First choice; the second choice gives up 0.21. Each piece left en prise is
    // covered by a counter-threat, so it is not a sacrifice.
    id: 'kasparov-topalov-1999-37w-Rd7',
    reputation: 'great',
    category: 'great',
    tags: ['only-good-move'],
  },
  {
    // First choice; the second choice gives up 0.24. Black has no piece left to sacrifice.
    id: 'topalov-shirov-1998-48b-Kf5',
    reputation: 'great',
    category: 'great',
    tags: ['only-good-move'],
  },
  {
    // The only defence, but played to get out of check, and the engine has Black
    // worse afterwards: neither upgrade applies.
    id: 'kasparov-topalov-1999-25b-Kb6',
    reputation: 'great',
    category: 'best',
    tags: [],
  },
  {
    // 26. Kd2 gave up 0.19 (mistake); 26...a4 gives up 0.20 and leaves Black
    // about where he stood before it.
    id: 'carlsen-anand-2014-g6-26b-a4',
    reputation: 'miss',
    category: 'miss',
    tags: ['missed-win'],
  },
  {
    // 31...Bxf8 gave up 0.40 (blunder); 32. Qg6+ gives up 0.32.
    id: 'topalov-kramnik-2006-g2-32w-Qg6',
    reputation: 'miss',
    category: 'miss',
    tags: ['missed-win'],
  },
  {
    // 60...Ra5 gave up 0.24 (blunder); 61. h5 gives up 0.25.
    id: 'chesscom-186299125430-61w-h5',
    reputation: 'miss',
    category: 'miss',
    tags: ['missed-win'],
  },
  {
    // 92...Kb7 gave up 0.35 (blunder); 93. Qe8 gives up 0.35.
    id: 'chesscom-186299125430-93w-Qe8',
    reputation: 'miss',
    category: 'miss',
    tags: ['missed-win'],
  },
  {
    // First choice; the second choice gives up only 0.03 and nothing is left en prise.
    id: 'lichess-LAGvRNey-7w-Re1',
    reputation: 'best',
    category: 'best',
    tags: [],
  },
  {
    // The engine's second choice in this run; it gives up 0.018.
    id: 'lichess-LAGvRNey-24w-Kf2',
    reputation: 'best',
    category: 'excellent',
    tags: [],
  },
  {
    // Not one of the engine's two lines, but the score after it is no lower: the
    // ladder says best.
    id: 'lichess-LAGvRNey-33w-Ree7',
    reputation: 'best',
    category: 'best',
    tags: [],
  },
  {
    // First choice; the second choice gives up only 0.01 and nothing is left en prise.
    id: 'carlsen-anand-2014-g6-27w-Ke2',
    reputation: 'best',
    category: 'best',
    tags: [],
  },
];

describe('special moves: what the method gives each real moment', () => {
  it('has an expectation for every moment and repeats its reputation', () => {
    expect(METHOD.map((entry) => entry.id)).toEqual(specialMoves.moments.map((m) => m.id));
    expect(METHOD.map((entry) => entry.reputation)).toEqual(
      specialMoves.moments.map((m) => m.expected.category),
    );
  });

  it.each(METHOD.map((entry) => [entry.id, entry] as const))('%s', (id, entry) => {
    const moment = specialMoves.moments.find((candidate) => candidate.id === id);
    if (!moment) throw new Error(`no moment ${id}`);
    const result = classifyMoment(moment);
    expect({ category: result.category, tags: result.tags }).toEqual({
      category: entry.category,
      tags: entry.tags,
    });
  });

  it('never calls a quiet control move brilliant or great', () => {
    const quiet = specialMoves.moments.filter((moment) => moment.kind === 'quiet-best');
    expect(quiet).toHaveLength(4);
    for (const moment of quiet) {
      expect(['brilliant', 'great']).not.toContain(classifyMoment(moment).category);
    }
  });

  it('needs the move before to call a missed win a miss', () => {
    for (const moment of specialMoves.moments.filter((m) => m.kind === 'missed-win')) {
      expect(['mistake', 'blunder']).toContain(classifyMoment(moment, false).category);
    }
  });
});
