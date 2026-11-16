import { describe, expect, it } from 'vitest';
import type { GameRecord } from '@/contract';
import { connectedAccounts, mergeGames, usernameFor } from './accounts';

const game = (id: string, source: GameRecord['source'], playedAt: string | null) =>
  ({ id, source, playedAt }) as GameRecord;

describe('connectedAccounts', () => {
  it('lists the connected accounts, the primary one first', () => {
    expect(
      connectedAccounts({ lichess: 'liUser', chesscom: 'CcUser', primary: 'chesscom' }),
    ).toEqual([
      { source: 'chesscom', username: 'CcUser' },
      { source: 'lichess', username: 'liUser' },
    ]);
    expect(connectedAccounts({ lichess: 'liUser', chesscom: null, primary: 'lichess' })).toEqual([
      { source: 'lichess', username: 'liUser' },
    ]);
    expect(connectedAccounts(null)).toEqual([]);
  });
});

describe('usernameFor', () => {
  const accounts = { lichess: 'liUser', chesscom: 'CcUser', primary: 'lichess' as const };

  it('uses the account of the site the game came from', () => {
    expect(usernameFor(game('a', 'chesscom', null), accounts)).toBe('CcUser');
    expect(usernameFor(game('b', 'lichess', null), accounts)).toBe('liUser');
  });

  it('uses the primary account for a pasted game', () => {
    expect(usernameFor(game('c', 'pgn', null), accounts)).toBe('liUser');
  });

  it('gives null when no account is connected', () => {
    expect(usernameFor(game('d', 'lichess', null), null)).toBeNull();
  });
});

describe('mergeGames', () => {
  it('puts the games of every account in one list, newest first, each once', () => {
    const lichess = [
      game('l2', 'lichess', '2026-11-14T10:00:00Z'),
      game('l1', 'lichess', '2026-11-01T10:00:00Z'),
    ];
    const chesscom = [
      game('c1', 'chesscom', '2026-11-10T10:00:00Z'),
      game('l2', 'lichess', '2026-11-14T10:00:00Z'),
    ];
    expect(mergeGames([lichess, chesscom]).map((g) => g.id)).toEqual(['l2', 'c1', 'l1']);
  });

  it('puts games with no date last', () => {
    const list = [game('x', 'pgn', null), game('y', 'lichess', '2026-11-01T10:00:00Z')];
    expect(mergeGames([list]).map((g) => g.id)).toEqual(['y', 'x']);
  });
});
