/**
 * Move classification: the public surface of this package.
 *
 * `classifyGame` handles a whole evaluated game; `classifyMove` does one move
 * as soon as the positions on both sides of it are known, for results that
 * stream in. Sources and decisions: docs/sources/classification.md.
 */
export { expectedPoints, pointLoss } from './expectedPoints';

/**
 * The version of the move-labelling rules, kept with every analysis (contract: `rulesVersion`).
 * Raise it whenever a change to this package can change a label, so saved analyses are redone.
 * 1: until 2026-11-14 (not written down). 2: the owner's rules a and b and Fable's A1-01 to
 * A1-04 (2026-11-15). 3: every position searched from a cleared engine, so several engines can
 * share a game (2026-11-15, speed round; the evaluations change, so the labels can).
 * 4: a book move that is a real error (Inaccuracy, Mistake or Blunder, costing at least 1%) is
 * labelled as that error, not Book (owner, 2026-11-15, Fable review A1-05). Never released.
 * 5: the same, for Mistake and Blunder only; an Inaccuracy in the book stays Book (owner,
 * 2026-11-15).
 */
export const RULES_VERSION = 5;
export { findOpening, loadOpeningBook, type OpeningBook } from './opening';
export {
  classifyGame,
  classifyMove,
  moveInputAt,
  type ClassifyMoveInput,
  type MoveClassification,
} from './classifyGame';
