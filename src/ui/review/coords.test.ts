import { describe, expect, it } from 'vitest';
import { boardCoordinates } from './coords';

describe('boardCoordinates', () => {
  it('writes the files along the bottom row and the ranks down the left file, White below', () => {
    const { files, ranks } = boardCoordinates('white');
    expect(files.map((f) => f.label).join('')).toBe('abcdefgh');
    expect(ranks.map((r) => r.label).join('')).toBe('87654321');
    expect(files.map((f) => f.column)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(ranks.map((r) => r.row)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('turns with the board, Black below', () => {
    const { files, ranks } = boardCoordinates('black');
    expect(files.map((f) => f.label).join('')).toBe('hgfedcba');
    expect(ranks.map((r) => r.label).join('')).toBe('12345678');
  });

  it('knows the shade of the square each label sits on', () => {
    // White below: a1 (bottom left) is dark, h1 light, a8 (top left) light.
    const white = boardCoordinates('white');
    expect(white.files[0]).toMatchObject({ label: 'a', light: false });
    expect(white.files[7]).toMatchObject({ label: 'h', light: true });
    expect(white.ranks[0]).toMatchObject({ label: '8', light: true });
    expect(white.ranks[7]).toMatchObject({ label: '1', light: false });
    // Black below: h8 (bottom left) is dark, h1 (top left) light.
    const black = boardCoordinates('black');
    expect(black.files[0]).toMatchObject({ label: 'h', light: false });
    expect(black.ranks[0]).toMatchObject({ label: '1', light: true });
  });
});
