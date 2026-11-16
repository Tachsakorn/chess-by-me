import { describe, expect, it } from 'vitest';
import { queuedGames, setQueuedGames } from './queuedGames';

describe('queuedGames', () => {
  it('holds the running game and every waiting one', () => {
    setQueuedGames('a', ['b', 'c']);
    expect([...queuedGames()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('holds only the waiting games when nothing runs', () => {
    setQueuedGames(null, ['b']);
    expect([...queuedGames()]).toEqual(['b']);
    setQueuedGames(null, []);
    expect(queuedGames().size).toBe(0);
  });
});
