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
