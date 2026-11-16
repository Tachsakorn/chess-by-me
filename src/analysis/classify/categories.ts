/**
 * The ladder of categories from Best down to Blunder.
 *
 * The thresholds and the treatment of mate scores follow WintrChess (GPL-3.0,
 * WintrCat/wintrchess at commit d145b2096895,
 * shared/src/lib/reporter/classification/pointLoss.ts). The code is written
 * for this project's `Score` type; nothing is copied. Every number below is
 * listed with its source line in docs/sources/classification.md, together with
 * the one case that is decided differently here.
 */
import type { Color, MoveCategory, Score } from '@/contract';
import { pointLoss } from './expectedPoints';

/** The categories the ladder can give. */
export type LadderCategory = Extract<
  MoveCategory,
  'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'
>;

/** Upper bounds (exclusive) of expected-point loss for each step of the ladder. */
export const LOSS_BELOW = {
  best: 0.01,
  excellent: 0.045,
  good: 0.08,
  inaccuracy: 0.12,
  mistake: 0.22,
} as const;

/** The plain point-loss ladder, used when both scores are in centipawns. */
export function categoryForLoss(loss: number): LadderCategory {
  if (loss < LOSS_BELOW.best) return 'best';
  if (loss < LOSS_BELOW.excellent) return 'excellent';
  if (loss < LOSS_BELOW.good) return 'good';
  if (loss < LOSS_BELOW.inaccuracy) return 'inaccuracy';
  if (loss < LOSS_BELOW.mistake) return 'mistake';
  return 'blunder';
}

/**
 * A score seen from one player's side. `cp`: centipawns, positive is good for
 * that player. `mate`: a forced mate in `moves` (0 = already delivered), for
 * the player when `winning`, against them otherwise.
 */
export type SidedScore =
  { kind: 'cp'; value: number } | { kind: 'mate'; moves: number; winning: boolean };

/** A drawn game is level (0 centipawns); a won game is a mate in 0 for the winner. */
export function scoreFor(score: Score, color: Color): SidedScore {
  switch (score.kind) {
    case 'cp':
      return { kind: 'cp', value: color === 'white' ? score.value : -score.value };
    case 'mate':
      return { kind: 'mate', moves: score.moves, winning: score.winner === color };
    case 'over':
      if (score.winner === null) return { kind: 'cp', value: 0 };
      return { kind: 'mate', moves: 0, winning: score.winner === color };
  }
}

/** The ladder from best to blunder, mildest first. */
const LADDER: readonly LadderCategory[] = [
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
];

/** The harsher of two categories. */
function harsher(a: LadderCategory, b: LadderCategory): LadderCategory {
  return LADDER.indexOf(a) >= LADDER.indexOf(b) ? a : b;
}

/**
 * The category a move gets from the scores before and after it alone, for a
 * move that is not the engine's first choice. Mate scores have their own rules,
 * but never give a milder label than the plain point-loss ladder gives for the
 * same loss (Fable review A1-01, 2026-11-15): without that, letting a mate in 1
 * go to +2.5 was an Inaccuracy and allowing a mate from +8 one as well. The mate
 * rules can still make a label harsher. (WintrChess uses the mate tables alone;
 * this is listed among the differences in docs/sources/classification.md.)
 */
export function categoryByRules(before: Score, after: Score, mover: Color): LadderCategory {
  const byLoss = categoryForLoss(pointLoss(before, after, mover));
  return harsher(byMateRules(before, after, mover), byLoss);
}

/** WintrChess's rules: the mate tables when a mate score is involved, else the ladder. */
function byMateRules(before: Score, after: Score, mover: Color): LadderCategory {
  const was = scoreFor(before, mover);
  const now = scoreFor(after, mover);

  if (was.kind === 'mate' && now.kind === 'mate') {
    // A forced mate for the mover became a forced mate for the opponent.
    if (was.winning && !now.winning) return now.moves > 3 ? 'mistake' : 'blunder';
    // The mover was being mated and now has the mate: nothing was given up.
    // (WintrChess counts the moves across the change of sign and marks it down.)
    if (!was.winning && now.winning) return 'best';

    // How many moves the mover's prospects moved the wrong way: the winner
    // wants the count to fall by one, the loser wants it to stay the same.
    const signed = (score: { moves: number; winning: boolean }) =>
      score.winning ? score.moves : -score.moves;
    const mateLoss = signed(now) - signed(was);
    if (mateLoss < 0 || (mateLoss === 0 && !now.winning)) return 'best';
    if (mateLoss < 2) return 'excellent';
    if (mateLoss < 7) return 'good';
    return 'inaccuracy';
  }

  if (was.kind === 'mate' && now.kind === 'cp') {
    // The mover was being mated and no longer is: nothing was given up.
    // (WintrChess grades this on the centipawn score like the case below.)
    if (!was.winning) return 'best';
    // The mover had a forced mate and let it go; what is left decides.
    if (now.value >= 800) return 'excellent';
    if (now.value >= 400) return 'good';
    if (now.value >= 200) return 'inaccuracy';
    if (now.value >= 0) return 'mistake';
    return 'blunder';
  }

  if (was.kind === 'cp' && now.kind === 'mate') {
    if (now.winning) return 'best';
    // The move lets the opponent force mate: the quicker the mate, the worse.
    if (now.moves <= 2) return 'blunder';
    if (now.moves <= 5) return 'mistake';
    return 'inaccuracy';
  }

  return categoryForLoss(pointLoss(before, after, mover));
}
