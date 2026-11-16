import { describe, expect, it } from 'vitest';
import { KEEP_PER_ACCOUNT, gamesToDrop } from './keep';

const game = (id: string, playedAt: string | null) => ({ id, playedAt });

// Fable review A6-02: each account keeps its newest games; an analysed game is never dropped.
describe('gamesToDrop', () => {
  it('drops nothing up to the limit', () => {
    const rows = [game('a', '2026-11-01T00:00:00Z'), game('b', '2026-11-02T00:00:00Z')];
    expect(gamesToDrop(rows, new Set(), 2)).toEqual([]);
  });

  it('drops the oldest games beyond the limit, whatever order they come in', () => {
    const rows = [
      game('old', '2026-01-01T00:00:00Z'),
      game('new', '2026-11-01T00:00:00Z'),
      game('mid', '2026-06-01T00:00:00Z'),
    ];
    expect(gamesToDrop(rows, new Set(), 1).sort()).toEqual(['mid', 'old']);
  });

  it('never drops an analysed game, and does not keep a newer one in its place', () => {
    const rows = [
      game('new', '2026-11-01T00:00:00Z'),
      game('mid', '2026-06-01T00:00:00Z'),
      game('old', '2026-01-01T00:00:00Z'),
    ];
    // "new" fills the one place; "old" is analysed and stays on top of that.
    expect(gamesToDrop(rows, new Set(['old']), 1)).toEqual(['mid']);
  });

  it('drops a game with no date before any dated one', () => {
    const rows = [game('dated', '2020-01-01T00:00:00Z'), game('undated', null)];
    expect(gamesToDrop(rows, new Set(), 1)).toEqual(['undated']);
  });

  it('keeps 200 games per account', () => {
    expect(KEEP_PER_ACCOUNT).toBe(200);
  });
});
