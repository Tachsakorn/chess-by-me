/**
 * Arrows on the board (the analysis board, 2026-11-26): the engine's best move in green
 * (`--q-great`) and, when turned on, the threat in red (`--danger`). The review screen draws none
 * (BRIEF-UI 5.4).
 */
import type { DrawBrush, DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';

export interface BoardArrow {
  /** The move in UCI: "g1f3", "e7e8q". */
  uci: string;
  kind: 'best' | 'threat';
}

const SQUARE = /^[a-h][1-8]$/;

/** The arrows as chessground shapes; a move that is not a pair of squares is left out. */
export function arrowShapes(arrows: readonly BoardArrow[]): DrawShape[] {
  const shapes: DrawShape[] = [];
  for (const arrow of arrows) {
    const orig = arrow.uci.slice(0, 2);
    const dest = arrow.uci.slice(2, 4);
    if (!SQUARE.test(orig) || !SQUARE.test(dest) || orig === dest) continue;
    shapes.push({ orig: orig as Key, dest: dest as Key, brush: arrow.kind });
  }
  return shapes;
}

/**
 * The two brushes, in the colours of the tokens read from the page (no colour is written here),
 * drawn the way chessground draws its own green arrows.
 */
export function arrowBrushes(
  base: DrawBrush,
  tokenColour: (name: string) => string,
): Record<BoardArrow['kind'], DrawBrush> {
  return {
    best: { ...base, key: 'best', color: tokenColour('--q-great') },
    threat: { ...base, key: 'threat', color: tokenColour('--danger') },
  };
}
