/**
 * Both sites connected at once (owner, 2026-11-15): the accounts in order, whose name a game is
 * seen from, and one list of games from every account. The drawings show one site only.
 */
import type { GameRecord } from '@/contract';
import type { Accounts } from '@/data/local';
import type { AccountSource } from '@/data/ratings';

export interface ConnectedAccount {
  source: AccountSource;
  username: string;
}

/** The connected accounts, the primary one (the first connected) first. */
export function connectedAccounts(accounts: Accounts | null): ConnectedAccount[] {
  if (!accounts) return [];
  const order: AccountSource[] =
    accounts.primary === 'chesscom' ? ['chesscom', 'lichess'] : ['lichess', 'chesscom'];
  return order.flatMap((source) => {
    const username = accounts[source];
    return username ? [{ source, username }] : [];
  });
}

/** The user's name in this game: the account of the site it came from, else the primary one. */
export function usernameFor(game: GameRecord, accounts: Accounts | null): string | null {
  if (!accounts) return null;
  if (game.source === 'lichess' || game.source === 'chesscom') {
    const own = accounts[game.source];
    if (own) return own;
  }
  return accounts[accounts.primary];
}

/** The games of every account in one list, newest first, each game once. */
export function mergeGames(lists: readonly (readonly GameRecord[])[]): GameRecord[] {
  const seen = new Set<string>();
  const all: GameRecord[] = [];
  for (const game of lists.flat()) {
    if (seen.has(game.id)) continue;
    seen.add(game.id);
    all.push(game);
  }
  return all.sort((a, b) => (b.playedAt ?? '').localeCompare(a.playedAt ?? ''));
}
