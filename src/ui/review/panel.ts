/**
 * What the panels under the board say (BRIEF-UI 6.2): the Move panel for the move on the board,
 * and the turning points of the Summary panel. Nothing here evaluates chess: it picks and words
 * what the analysis recorded.
 */
import type { GameRecord, MoveCategory } from '@/contract';
import { moveLabel } from '@/ui/model/games';
import type { AnalysisState } from './analysisState';
import { formatScore } from './model';

/**
 * A line of moves numbered as on a scoresheet. `startPly` is the position the line starts from:
 * even when White is to move. "8. h3 Nh6", or "8... Nh6 9. Bxh6 gxh6" when Black moves first.
 */
export function numberedLine(startPly: number, sans: readonly string[]): string {
  const parts: string[] = [];
  sans.forEach((san, index) => {
    const ply = startPly + index;
    const number = Math.floor(ply / 2) + 1;
    if (ply % 2 === 0) parts.push(`${number}.`);
    else if (index === 0) parts.push(`${number}...`);
    parts.push(san);
  });
  return parts.join(' ');
}

export type SecondLine =
  | { kind: 'dropped'; percent: number }
  | { kind: 'held' }
  | { kind: 'best' }
  | { kind: 'book' }
  /** Under 1%, the mover was already lost / still winning (owner, 2026-11-15). */
  | { kind: 'lost' }
  | { kind: 'winning' }
  /** A Miss that let a forced mate go. */
  | { kind: 'missedMate'; moves: number };

/** "Already lost" below this share of the win chance, "still winning" above its mirror. */
const DECIDED = 0.05;

export interface ThirdLine {
  /** "Better was" after an error, "Best was" after a good move that was not the best. */
  kind: 'better' | 'bestWas';
  /** The engine's move, numbered: "8... Nh6". */
  best: string;
  /** What follows it in the engine's line, two plies: "9. Bxh6 gxh6". Empty for `bestWas`. */
  rest: string;
}

export type MoveText =
  | { kind: 'start' }
  | { kind: 'analyzing' }
  | {
      kind: 'move';
      /** "8... d5?" */
      label: string;
      category: MoveCategory;
      /** "+1.0 → +2.5", White's side; null while a position is missing. */
      evalText: string | null;
      line2: SecondLine;
      line3: ThirdLine | null;
    };

const ERRORS: readonly MoveCategory[] = ['inaccuracy', 'mistake', 'miss', 'blunder'];
/** Plies of the engine's line written after the better move. */
const LINE_AFTER = 2;

export function moveText(game: GameRecord, state: AnalysisState, ply: number): MoveText {
  if (ply === 0) return { kind: 'start' };
  const review = state.reviews[ply - 1];
  if (!review) return { kind: 'analyzing' };
  const before = state.positions[ply - 1];
  const after = state.positions[ply];
  const evalText =
    before && after ? `${formatScore(before.score)} → ${formatScore(after.score)}` : null;
  // Rounded down, so the text never crosses a line the label did not cross: a Good move (4.5–5%)
  // never reads "5%" (Fable review 1.1 B3-01). The tiny addition keeps 0.29 from reading 28.
  const percent = Math.floor(review.pointLoss * 100 + 1e-9);
  // Under 1% nothing is said about a drop (rule c): the position speaks instead.
  const mover = game.moves[ply - 1]?.color ?? 'white';
  const moverBefore = before
    ? mover === 'white'
      ? before.whiteExpected
      : 1 - before.whiteExpected
    : 0.5;
  const calm = (): SecondLine =>
    moverBefore < DECIDED
      ? { kind: 'lost' }
      : moverBefore > 1 - DECIDED
        ? { kind: 'winning' }
        : { kind: 'held' };
  const chance = (): SecondLine =>
    review.pointLoss >= 0.01 ? { kind: 'dropped', percent } : calm();
  const engineLine = before?.lines[0]?.san ?? (review.best ? [review.best.san] : []);
  const bestSan = engineLine[0];
  const base = {
    kind: 'move' as const,
    label: moveLabel(game, ply, review.category),
    category: review.category,
    evalText,
  };

  if (review.category === 'book') return { ...base, line2: { kind: 'book' }, line3: null };
  if (review.category === 'best') return { ...base, line2: { kind: 'best' }, line3: null };
  if (ERRORS.includes(review.category)) {
    const missedMate =
      review.category === 'miss' &&
      review.tags.includes('missed-mate') &&
      before?.score.kind === 'mate'
        ? before.score.moves
        : null;
    return {
      ...base,
      line2: missedMate !== null ? { kind: 'missedMate', moves: missedMate } : chance(),
      line3: bestSan
        ? {
            kind: 'better',
            best: numberedLine(ply - 1, [bestSan]),
            rest: numberedLine(ply, engineLine.slice(1, 1 + LINE_AFTER)),
          }
        : null,
    };
  }
  // brilliant, great, excellent, good
  return {
    ...base,
    line2: chance(),
    line3:
      bestSan && !review.playedIsBest
        ? { kind: 'bestWas', best: numberedLine(ply - 1, [bestSan]), rest: '' }
        : null,
  };
}

export interface KeyMoment {
  ply: number;
  label: string;
  category: MoveCategory;
}

/**
 * The turning points of the game (BRIEF-UI 6.2, Summary): the moves that moved the expected
 * points most, good or bad, at most `max`, in the order they were played.
 */
export function keyMoments(game: GameRecord, state: AnalysisState, max: number): KeyMoment[] {
  const swings: { ply: number; swing: number }[] = [];
  state.reviews.forEach((review, index) => {
    const before = state.positions[index];
    const after = state.positions[index + 1];
    if (!review || !before || !after) return;
    swings.push({ ply: review.ply, swing: Math.abs(after.whiteExpected - before.whiteExpected) });
  });
  return swings
    .sort((a, b) => b.swing - a.swing || a.ply - b.ply)
    .slice(0, max)
    .sort((a, b) => a.ply - b.ply)
    .map(({ ply }) => {
      const category = state.reviews[ply - 1]!.category;
      return { ply, category, label: moveLabel(game, ply, category) };
    });
}

export type QualityTone =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

/**
 * The colour a category is drawn in: every category has one since the owner's second badge
 * design (2026-11-15), for its badge and its dots. Move text in All Moves is coloured only for
 * the notable categories (ReviewPanels.tsx). Null is kept for callers that check.
 */
export function qualityTone(category: MoveCategory): QualityTone | null {
  switch (category) {
    case 'brilliant':
    case 'great':
    case 'best':
    case 'excellent':
    case 'good':
    case 'book':
    case 'inaccuracy':
    case 'mistake':
    case 'miss':
    case 'blunder':
      return category;
    default:
      return null;
  }
}

export interface MoveRow {
  number: number;
  /** The ply of White's move in this row, or null when the row has none. */
  white: number | null;
  black: number | null;
}

/**
 * The move table of the iPad landscape layout (owner, 2026-11-15): one full move per row, the
 * move number, then White's move, then Black's.
 */
export function moveRows(game: GameRecord): MoveRow[] {
  const rows: MoveRow[] = [];
  for (const move of game.moves) {
    let row = rows.at(-1);
    if (!row || row.number !== move.moveNumber) {
      row = { number: move.moveNumber, white: null, black: null };
      rows.push(row);
    }
    row[move.color] = move.ply;
  }
  return rows;
}
