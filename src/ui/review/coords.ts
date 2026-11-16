/**
 * The coordinates written on the review board (owner, 2026-11-15): the files along the bottom
 * row, the ranks down the left-hand file, as the board is shown (they turn with it).
 */
import type { Color } from '@/contract';

export interface FileLabel {
  label: string;
  /** 0..7 from the left of the board as shown. */
  column: number;
  /** The square under the label is light (the label then takes the dark shade). */
  light: boolean;
}

export interface RankLabel {
  label: string;
  /** 0..7 from the top of the board as shown. */
  row: number;
  light: boolean;
}

// The top left square of the board is light whichever side is below.
const lightAt = (column: number, row: number) => (column + row) % 2 === 0;

export function boardCoordinates(bottom: Color): { files: FileLabel[]; ranks: RankLabel[] } {
  const order = Array.from({ length: 8 }, (_, i) => i);
  const fileNames = 'abcdefgh';
  return {
    files: order.map((column) => ({
      label: fileNames[bottom === 'white' ? column : 7 - column]!,
      column,
      light: lightAt(column, 7),
    })),
    ranks: order.map((row) => ({
      label: String(bottom === 'white' ? 8 - row : row + 1),
      row,
      light: lightAt(0, row),
    })),
  };
}
