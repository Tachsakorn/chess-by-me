/**
 * What the app keeps on this device (BRIEF-UI section 1: no accounts, everything local), in
 * IndexedDB through `idb`. Added for the redesign as its own module.
 *
 * - `games`: every game the app has seen, with the account it came from, or `OTHER_GAMES` for a
 *   game opened from Search, a link or pasted PGN. Version 1 kept null there, which IndexedDB
 *   cannot index, so those games could not be listed (Fable review A6-06); version 2 moves them.
 * - `analyses`: finished analyses, checked against the contract before they are saved.
 * - `summaries`: the two accuracies of each analysed game, small enough to read all at once for
 *   the lists.
 * - `kv`: the connected accounts, the last ratings seen, where the user stopped in each game, the
 *   Chess.com months already stored.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { validateGameAnalysis, type GameAnalysis, type GameRecord } from '@/contract';
import { validPlayedAt, withValidDate } from './dates';
import { gamesToDrop, KEEP_PER_ACCOUNT } from './keep';
import type { AccountSource, RatedClass } from './ratings';

export interface Accounts {
  lichess: string | null;
  chesscom: string | null;
  /** The account Home and My Games show: the first one connected. */
  primary: AccountSource;
}

export interface RatingShown {
  rating: number | null;
  /** Change to show next to it; null for none or unknown. */
  change: number | null;
}
export type RatingsShown = Record<RatedClass, RatingShown>;

export interface ReviewProgress {
  ply: number;
  flipped: boolean;
  /** ms since 1970: when the user last left this game. */
  at: number;
}

export interface AnalysisSummary {
  gameId: string;
  white: number;
  black: number;
}

/** The owner of games opened from Search, a link or pasted PGN: no connected account. */
export const OTHER_GAMES = 'other';

interface StoredGame {
  id: string;
  /** `ownerKey(...)` of an account, or OTHER_GAMES. */
  owner: string;
  playedAt: string | null;
  /** ms since 1970: when the user last opened it. Other games only. */
  openedAt?: number;
  game: GameRecord;
}

interface Schema extends DBSchema {
  games: { key: string; value: StoredGame; indexes: { owner: string } };
  analyses: { key: string; value: GameAnalysis };
  summaries: { key: string; value: AnalysisSummary };
  kv: { key: string; value: unknown };
}

/** "lichess:ni5hu": the key of one account's games. */
export function ownerKey(source: AccountSource, username: string): string {
  return `${source}:${username.trim().toLowerCase()}`;
}

/**
 * Told when a write fails (Fable review A6-01): a full device, or storage taken away after the app
 * opened. The screens show a note; the failed call still rejects for its caller.
 */
const writeFailureListeners = new Set<() => void>();
export function onWriteFailure(listener: () => void): () => void {
  writeFailureListeners.add(listener);
  return () => writeFailureListeners.delete(listener);
}
/** Errors of writes, told to the listeners once the write has failed for good (below). */
const failedWrites = new WeakSet<object>();
async function writing<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (typeof error === 'object' && error !== null) failedWrites.add(error);
    throw error;
  }
}

function tellWriteFailure(error: unknown): void {
  if (typeof error === 'object' && error !== null && failedWrites.has(error)) {
    for (const listener of writeFailureListeners) listener();
  }
}

/**
 * The browser closed the app's connection (Fable review 1.1 B4-05): site data cleared or evicted
 * while the app is open, or the connection closed for another reason. The error names differ:
 * "The database connection is closing" (InvalidStateError), "Connection is closing because of…"
 * (UnknownError).
 */
function lostConnection(error: unknown): boolean {
  if (!(error instanceof Error) && !(error instanceof DOMException)) return false;
  return (
    error.name === 'InvalidStateError' ||
    // A transaction under way when the connection went is aborted; a full device aborts one
    // too, and then fails again on the new connection, which is when it is reported.
    error.name === 'AbortError' ||
    /connection is clos|database is clos|connection was closed/i.test(error.message)
  );
}

let opening: Promise<IDBPDatabase<Schema>> | null = null;
function db(): Promise<IDBPDatabase<Schema>> {
  if (opening) return opening;
  // A refused open is not kept, so "Try again" can open again.
  const thisOpen: Promise<IDBPDatabase<Schema>> = openDB<Schema>('chessbyme', 2, {
    // Closed by the browser: the next use opens it again (Fable review 1.1 B4-05).
    terminated() {
      if (opening === thisOpen) opening = null;
    },
    // A newer version of the app (another tab) needs the database: let it go, open again later.
    blocking(_current, _blocked, event) {
      (event.target as IDBDatabase).close();
      if (opening === thisOpen) opening = null;
    },
    async upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const games = database.createObjectStore('games', { keyPath: 'id' });
        games.createIndex('owner', 'owner');
        database.createObjectStore('analyses', { keyPath: 'gameId' });
        database.createObjectStore('summaries', { keyPath: 'gameId' });
        database.createObjectStore('kv');
      }
      if (oldVersion === 1) {
        // Version 1 kept other games with owner null, outside the owner index.
        let cursor = await transaction.objectStore('games').openCursor();
        while (cursor) {
          if ((cursor.value.owner as string | null) === null) {
            await cursor.update({ ...cursor.value, owner: OTHER_GAMES });
          }
          cursor = await cursor.continue();
        }
      }
    },
  }).catch((error: unknown) => {
    if (opening === thisOpen) opening = null;
    throw error;
  });
  opening = thisOpen;
  return thisOpen;
}

/** How many ids of games dropped by `trimOwner` are remembered per account. */
const DROPPED_KEPT = 1000;

/** Set in `kv` once the stored dates have been checked (1.1.1). */
const DATES_REPAIRED = 'repaired:dates';

/** The row with an impossible date read as no date, in the row and in its game (B4-04). */
function validRow(row: StoredGame): StoredGame {
  const playedAt = validPlayedAt(row.playedAt);
  const game = withValidDate(row.game);
  return playedAt === row.playedAt && game === row.game ? row : { ...row, playedAt, game };
}

function newestFirst(a: StoredGame, b: StoredGame): number {
  return (b.playedAt ?? '').localeCompare(a.playedAt ?? '');
}

const store = {
  async getAccounts(): Promise<Accounts | null> {
    return ((await (await db()).get('kv', 'accounts')) as Accounts | undefined) ?? null;
  },
  async setAccounts(accounts: Accounts | null): Promise<void> {
    await writing(async () => {
      const d = await db();
      if (accounts) await d.put('kv', accounts, 'accounts');
      else await d.delete('kv', 'accounts');
    });
  },

  async listGames(owner: string): Promise<GameRecord[]> {
    const rows = (await (await db()).getAllFromIndex('games', 'owner', owner)).map(validRow);
    return rows.sort(newestFirst).map((row) => row.game);
  },
  /**
   * Games opened from Search, a link or pasted PGN: the one opened last first. "Opened" is the
   * later of when it was saved from those places and when the user last left its review (a game
   * reopened from the list is not saved again).
   */
  async listOtherGames(): Promise<GameRecord[]> {
    const d = await db();
    const [rows, progress] = await Promise.all([
      d.getAllFromIndex('games', 'owner', OTHER_GAMES),
      d.get('kv', 'progress') as Promise<Record<string, ReviewProgress> | undefined>,
    ]);
    const opened = (row: StoredGame) => Math.max(row.openedAt ?? 0, progress?.[row.id]?.at ?? 0);
    return rows
      .map(validRow)
      .sort((a, b) => opened(b) - opened(a) || newestFirst(a, b))
      .map((row) => row.game);
  },
  /**
   * The ids of the games of an account the app has: stored, or dropped by `trimOwner` as too old
   * to keep. Read without the games themselves (Fable review 1.1 B5-01).
   */
  async knownGameIds(owner: string): Promise<string[]> {
    const d = await db();
    const [stored, dropped] = await Promise.all([
      d.getAllKeysFromIndex('games', 'owner', owner),
      d.get('kv', `dropped:${owner}`) as Promise<string[] | undefined>,
    ]);
    return [...stored, ...(dropped ?? [])];
  },
  async getGame(id: string): Promise<GameRecord | null> {
    const row = await (await db()).get('games', id);
    return row ? validRow(row).game : null;
  },
  /**
   * Stores "no date" for every game saved with a date that is not a real one (1.1.1, Fable review
   * 1.1 B4-04: a pasted `[Date "2024.00.00"]` was kept as `2024-00-00T00:00:00Z` and broke
   * My Games › Others). The lists already read such a date as none; this fixes what is stored,
   * once per device (a mark in `kv`). Returns how many games were repaired.
   */
  async repairDates(): Promise<number> {
    const d = await db();
    if (await d.get('kv', DATES_REPAIRED)) return 0;
    return writing(async () => {
      const tx = d.transaction(['games', 'kv'], 'readwrite');
      let repaired = 0;
      let cursor = await tx.objectStore('games').openCursor();
      while (cursor) {
        const fixed = validRow(cursor.value);
        if (fixed !== cursor.value) {
          await cursor.update(fixed);
          repaired += 1;
        }
        cursor = await cursor.continue();
      }
      await tx.objectStore('kv').put(true, DATES_REPAIRED);
      await tx.done;
      return repaired;
    });
  },
  /**
   * Saves games under an account, or (owner null) as games the user opened: those are kept under
   * OTHER_GAMES and marked opened now. A game already kept under an account stays under it.
   */
  async putGames(games: readonly GameRecord[], owner: string | null): Promise<void> {
    await writing(async () => {
      const tx = (await db()).transaction('games', 'readwrite');
      const now = Date.now();
      for (const record of games) {
        const game = withValidDate(record);
        const before = await tx.store.get(game.id);
        const kept = owner ?? before?.owner ?? OTHER_GAMES;
        const openedAt = owner === null ? now : before?.openedAt;
        await tx.store.put({
          id: game.id,
          owner: kept,
          playedAt: game.playedAt,
          ...(kept === OTHER_GAMES && openedAt !== undefined ? { openedAt } : {}),
          game,
        });
      }
      await tx.done;
    });
  },

  /**
   * Keeps an account's newest `keep` games (Fable review A6-02) and deletes older ones, except
   * games that are analysed, that the user has opened, or that are in `protect` (waiting to be
   * analysed). Returns how many were deleted.
   */
  async trimOwner(
    owner: string,
    protect: ReadonlySet<string> = new Set(),
    keep: number = KEEP_PER_ACCOUNT,
  ): Promise<number> {
    return writing(async () => {
      const tx = (await db()).transaction(['games', 'analyses', 'kv'], 'readwrite');
      const games = tx.objectStore('games');
      const rows = await games.index('owner').getAll(owner);
      let drop: string[] = [];
      if (rows.length > keep) {
        const progress =
          ((await tx.objectStore('kv').get('progress')) as Record<string, ReviewProgress>) ?? {};
        const kept = new Set<string>(protect);
        for (const id of Object.keys(progress)) kept.add(id);
        for (const id of await tx.objectStore('analyses').getAllKeys()) kept.add(id);
        drop = gamesToDrop(rows, kept, keep);
        for (const id of drop) await games.delete(id);
        if (drop.length > 0) {
          // Remembered, so the site's copy of a dropped game is not read again at every update
          // (Fable review 1.1 B5-01). The newest DROPPED_KEPT only: older ones are in no month the
          // app reads.
          const kv = tx.objectStore('kv');
          const key = `dropped:${owner}`;
          const before = ((await kv.get(key)) as string[] | undefined) ?? [];
          await kv.put([...new Set([...drop, ...before])].slice(0, DROPPED_KEPT), key);
        }
      }
      await tx.done;
      return drop.length;
    });
  },

  /** The Chess.com months of an account whose games are stored and no longer change. */
  async getChessComMonths(owner: string): Promise<string[]> {
    return ((await (await db()).get('kv', `chesscom-months:${owner}`)) as string[]) ?? [];
  },
  async addChessComMonths(owner: string, months: readonly string[]): Promise<void> {
    if (months.length === 0) return;
    await writing(async () => {
      const tx = (await db()).transaction('kv', 'readwrite');
      const key = `chesscom-months:${owner}`;
      const before = ((await tx.store.get(key)) as string[] | undefined) ?? [];
      await tx.store.put([...new Set([...before, ...months])], key);
      await tx.done;
    });
  },

  async getAnalysis(gameId: string): Promise<GameAnalysis | null> {
    return (await (await db()).get('analyses', gameId)) ?? null;
  },
  /** Keeps a finished analysis; refuses one that breaks the contract. */
  async putAnalysis(analysis: GameAnalysis, game: GameRecord): Promise<void> {
    const problems = validateGameAnalysis(analysis, game);
    if (problems.length > 0) throw new Error(`Analysis fails the contract: ${problems[0]}`);
    await writing(async () => {
      const tx = (await db()).transaction(['analyses', 'summaries'], 'readwrite');
      await tx.objectStore('analyses').put(analysis);
      await tx.objectStore('summaries').put({
        gameId: analysis.gameId,
        white: analysis.white.accuracy,
        black: analysis.black.accuracy,
      });
      await tx.done;
    });
  },
  async listSummaries(): Promise<AnalysisSummary[]> {
    return (await db()).getAll('summaries');
  },

  async getRatings(owner: string): Promise<RatingsShown | null> {
    return ((await (await db()).get('kv', `ratings:${owner}`)) as RatingsShown | undefined) ?? null;
  },
  async setRatings(owner: string, ratings: RatingsShown): Promise<void> {
    await writing(async () => {
      await (await db()).put('kv', ratings, `ratings:${owner}`);
    });
  },

  async getProgress(): Promise<Record<string, ReviewProgress>> {
    return ((await (await db()).get('kv', 'progress')) as Record<string, ReviewProgress>) ?? {};
  },
  async setProgress(gameId: string, progress: ReviewProgress): Promise<void> {
    await writing(async () => {
      const tx = (await db()).transaction('kv', 'readwrite');
      const all = ((await tx.store.get('progress')) as Record<string, ReviewProgress>) ?? {};
      all[gameId] = progress;
      await tx.store.put(all, 'progress');
      await tx.done;
    });
  },

  /**
   * Deletes everything kept for one account (Fable review A2-02): its games, their analyses,
   * its ratings, where the user stopped in its games, and which Chess.com months were stored.
   */
  async deleteOwner(owner: string): Promise<void> {
    const tx = (await db()).transaction(['games', 'analyses', 'summaries', 'kv'], 'readwrite');
    const ids = await tx.objectStore('games').index('owner').getAllKeys(owner);
    for (const id of ids) {
      await tx.objectStore('games').delete(id);
      await tx.objectStore('analyses').delete(id);
      await tx.objectStore('summaries').delete(id);
    }
    const kv = tx.objectStore('kv');
    await kv.delete(`ratings:${owner}`);
    // Else a reconnected account would skip the months it no longer has, or games it never got.
    await kv.delete(`chesscom-months:${owner}`);
    await kv.delete(`dropped:${owner}`);
    const progress = ((await kv.get('progress')) as Record<string, ReviewProgress>) ?? {};
    const gone = new Set<string>(ids);
    await kv.put(
      Object.fromEntries(Object.entries(progress).filter(([id]) => !gone.has(id))),
      'progress',
    );
    await tx.done;
  },

  /** Deletes everything the app keeps in this database, accounts included (Settings › Storage). */
  async clearAll(): Promise<void> {
    const tx = (await db()).transaction(['games', 'analyses', 'summaries', 'kv'], 'readwrite');
    await Promise.all([
      tx.objectStore('games').clear(),
      tx.objectStore('analyses').clear(),
      tx.objectStore('summaries').clear(),
      tx.objectStore('kv').clear(),
      tx.done,
    ]);
  },
};

/**
 * Every call of `store`, done once more on a newly opened connection when the browser closed the
 * one in use (Fable review 1.1 B4-05). Each call is safe to repeat: reads, puts of the same rows,
 * deletes.
 */
function reopening<T extends Record<string, (...args: never[]) => Promise<unknown>>>(calls: T): T {
  const wrapped: Record<string, unknown> = {};
  for (const [name, call] of Object.entries(calls)) {
    wrapped[name] = async (...args: never[]) => {
      try {
        return await call(...args);
      } catch (error) {
        if (!lostConnection(error)) {
          tellWriteFailure(error);
          throw error;
        }
        opening = null;
        try {
          return await call(...args);
        } catch (again) {
          tellWriteFailure(again);
          throw again;
        }
      }
    };
  }
  return wrapped as T;
}

export const local = reopening(store);

export type LocalStore = typeof local;
