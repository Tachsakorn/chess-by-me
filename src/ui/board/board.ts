/**
 * The geometry of a still board (BRIEF-UI section 5.4): which piece stands on which square,
 * which squares the last move used, and which of the four colour sets a game gets.
 */
import type { Color } from '@/contract';
import type { PieceCode } from './pieces';

export const PALETTES = ['blue', 'green', 'orange', 'purple'] as const;
export type Palette = (typeof PALETTES)[number];

/** A game keeps its colours for good: the set comes from a hash of its id. */
export function paletteFor(gameId: string): Palette {
  let hash = 2166136261;
  for (let i = 0; i < gameId.length; i++) {
    hash ^= gameId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return PALETTES[(hash >>> 0) % PALETTES.length] as Palette;
}

export interface BoardSquare {
  square: string;
  light: boolean;
  piece: PieceCode | null;
  /** The square the last move left or reached. */
  moved: boolean;
}

const FILES = 'abcdefgh';

/**
 * The 64 squares in reading order (top-left first) as seen from `orientation`.
 * `lastMove` is in UCI ("e2e4"); null for none.
 */
export function boardSquares(
  fen: string,
  lastMove: string | null,
  orientation: Color,
): BoardSquare[] {
  const placement = fen.split(' ')[0] ?? '';
  const byName = new Map<string, PieceCode>();
  placement.split('/').forEach((row, r) => {
    let file = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const color = ch === ch.toUpperCase() ? 'w' : 'b';
      byName.set(`${FILES[file]}${8 - r}`, `${color}${ch.toUpperCase()}` as PieceCode);
      file++;
    }
  });
  const moved = lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : [];
  const squares: BoardSquare[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const file = orientation === 'white' ? f : 7 - f;
      const rank = orientation === 'white' ? 8 - r : r + 1;
      const name = `${FILES[file]}${rank}`;
      squares.push({
        square: name,
        light: (file + rank) % 2 === 0,
        piece: byName.get(name) ?? null,
        moved: moved.includes(name),
      });
    }
  }
  return squares;
}
