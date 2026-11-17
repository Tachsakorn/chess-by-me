/**
 * The geometry of the evaluation graph, kept apart from the drawing so it can be
 * tested. Nothing here evaluates chess: it only places what the analysis found.
 */
import type { PositionEval } from '@/contract';

/** One position on the graph. `x` and `y` run 0..1; y = 0 is the top, where White is winning. */
export interface GraphPoint {
  ply: number;
  x: number;
  y: number;
}

/**
 * The line of the graph: one point per position, from the start for as far as the
 * analysis has arrived. It stops at the first position that is still missing, so
 * the graph draws itself as the results come in.
 */
export function graphPoints(
  positions: readonly (PositionEval | undefined)[],
  lastPly: number,
): GraphPoint[] {
  const points: GraphPoint[] = [];
  for (let ply = 0; ply <= lastPly; ply += 1) {
    const position = positions[ply];
    if (!position) break;
    points.push({ ply, x: lastPly > 0 ? ply / lastPly : 0, y: 1 - position.whiteExpected });
  }
  return points;
}

/** The move nearest to a place along the graph; `fraction` 0 is its left edge, 1 its right. */
export function plyAtFraction(fraction: number, lastPly: number): number {
  return Math.min(lastPly, Math.max(0, Math.round(fraction * lastPly)));
}

/** The radius of a turning-point dot, and of the one on the move on the board. */
export const GRAPH_DOT_R = 3.5;
export const GRAPH_DOT_R_CURRENT = 4;
/** The width of the line and of the cursor. */
export const GRAPH_LINE_W = 1.5;
/**
 * Room kept free at the top and the bottom of the drawing, so that a dot on a position that is
 * won outright (mate, ±10) shows whole and is not cut by the rounded box (round 3 of 1.1).
 */
export const GRAPH_INSET = Math.max(GRAPH_DOT_R, GRAPH_DOT_R_CURRENT) + GRAPH_LINE_W;

/** Where a point of `graphPoints` (y 0..1) sits in a graph `height` pixels tall. */
export function graphY(y: number, height: number): number {
  return GRAPH_INSET + y * Math.max(0, height - 2 * GRAPH_INSET);
}

/**
 * Where a point of `graphPoints` (x 0..1) sits in a graph `width` pixels wide: the same room is
 * kept free at the left and the right as at the top and the bottom (round 4 of 1.1), so the dot
 * of the first or the last move shows whole.
 */
export function graphX(x: number, width: number): number {
  return GRAPH_INSET + x * Math.max(0, width - 2 * GRAPH_INSET);
}

/**
 * The move nearest to a place `px` pixels from the left of a graph `width` pixels wide: the
 * inverse of `graphX`, so a finger on a dot goes to that dot's move. The free room at each side
 * belongs to the first and the last move.
 */
export function plyAtX(px: number, width: number, lastPly: number): number {
  const drawn = width - 2 * GRAPH_INSET;
  if (drawn <= 0) return 0;
  return plyAtFraction((px - GRAPH_INSET) / drawn, lastPly);
}

/** The heights of the graph (BRIEF-UI 6.2; round 3 of 1.1). */
export const GRAPH_H = 36;
export const GRAPH_H_SHORT = 28;
export const GRAPH_H_MAX = 72;

/**
 * How tall the graph is on the review screen. The board is sized first, as before: the smaller of
 * what the width allows (`byWidth`) and what the height allows with a 36px graph (`byHeight`).
 * When the width is what holds the board back, the height it leaves goes to the graph, up to
 * 72px. A short screen (under 760px) keeps 28px; the side column of a landscape iPad has 72px.
 * ReviewScreen.module.css works this out in CSS (`--graph-h`); e2e/graph.spec.ts checks that the
 * two agree at real screen sizes.
 */
export function graphHeight({
  byWidth,
  byHeight,
  short,
  wide,
}: {
  byWidth: number;
  byHeight: number;
  short: boolean;
  wide: boolean;
}): number {
  if (wide) return GRAPH_H_MAX;
  if (short) return GRAPH_H_SHORT;
  return GRAPH_H + Math.min(Math.max(byHeight - byWidth, 0), GRAPH_H_MAX - GRAPH_H);
}
