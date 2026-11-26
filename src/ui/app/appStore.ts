/**
 * What the screens share: the connected accounts, their games, which games are analysed, the
 * ratings, and where the user stopped in each game. Shows what is saved on the device at once,
 * then updates from the sites in the background (BRIEF-UI 6.1, "loading").
 *
 * With both sites connected (owner, 2026-11-15) the games of both accounts make one list, each
 * site keeps its own ratings, and a site that cannot be reached does not hide the other's games.
 */
import { create } from 'zustand';
import type { GameRecord } from '@/contract';
import { fetchLichessGames } from '@/data';
import { fetchChessComRecent } from '@/data/chesscom';
import {
  local,
  onWriteFailure,
  ownerKey,
  type Accounts,
  type AnalysisSummary,
  type RatingsShown,
  type ReviewProgress,
} from '@/data/local';
import { KEEP_PER_ACCOUNT } from '@/data/keep';
import { checkAccount, fetchRatings, type AccountSource } from '@/data/ratings';
import { connectedAccounts, mergeGames, type ConnectedAccount } from '@/ui/model/accounts';
import { ratingsToShow } from '@/ui/model/games';
import { queuedGames } from './queuedGames';

export type RefreshState = 'idle' | 'loading' | 'done' | 'failed';

interface AppState {
  /** False until what is saved on the device has been read. */
  loaded: boolean;
  accounts: Accounts | null;
  /** The games of every connected account, newest first. */
  games: GameRecord[];
  /**
   * Games opened from Search, a game link or pasted PGN, the one opened last first: My Games ›
   * Others (Fable review A6-06, owner 2026-11-15).
   */
  otherGames: GameRecord[];
  summaries: Record<string, AnalysisSummary>;
  progress: Record<string, ReviewProgress>;
  /** Each site's ratings: two rating systems, never added together. */
  ratings: Partial<Record<AccountSource, RatingsShown>>;
  /** Whose ratings Home shows; remembered on the device. */
  ratingsSite: AccountSource | null;
  refresh: RefreshState;
  /** The sites the last update could not reach. */
  failed: AccountSource[];
  /** Of those, the ones that asked the app to slow down (HTTP 429): "try again in a moment". */
  busy: AccountSource[];
  /**
   * Device storage (Fable review A6-01): `unavailable` when the browser refuses it altogether
   * (the app shows a screen that says so), `saveFailed` after a write failed (a full device).
   */
  storage: 'ok' | 'unavailable' | 'saveFailed';
  dismissSaveFailed(): void;

  load(): Promise<void>;
  refreshFromSite(): Promise<void>;
  /**
   * Updates from the sites when the app comes back to the screen, at most once every
   * RETURN_REFRESH_MS (Fable review 1.1 B5-04: an installed app brought back showed no new games
   * until it was closed and opened again).
   */
  refreshOnReturn(): void;
  /** Reads the other games again, after one was opened. */
  reloadOtherGames(): Promise<void>;
  addSummary(summary: AnalysisSummary): void;
  /** Saves the connected accounts (null: none left) and reads everything again. */
  setAccounts(accounts: Accounts | null): Promise<void>;
  /**
   * Stops what is on its way from the sites (Fable review 1.1 B4-01): an update still running
   * writes nothing once the accounts change. `setAccounts` does it too; call it first when
   * deleting an account's data, so nothing lands between the delete and the change.
   */
  stopUpdates(): void;
  setRatingsSite(site: AccountSource): void;
  saveProgress(gameId: string, progress: ReviewProgress): void;
}

export function primaryAccount(
  accounts: Accounts | null,
): { source: AccountSource; username: string } | null {
  if (!accounts) return null;
  const username = accounts[accounts.primary];
  return username ? { source: accounts.primary, username } : null;
}

const RATINGS_SITE_KEY = 'cbm.ratingsSite';

function readRatingsSite(): AccountSource | null {
  try {
    const value = localStorage.getItem(RATINGS_SITE_KEY);
    return value === 'lichess' || value === 'chesscom' ? value : null;
  } catch {
    return null; // storage blocked: start from the primary account
  }
}

function writeRatingsSite(site: AccountSource): void {
  try {
    localStorage.setItem(RATINGS_SITE_KEY, site);
  } catch {
    // storage blocked: the choice lasts until the app is closed
  }
}

/** The remembered site if it is still connected, else the primary account's. */
function pickRatingsSite(list: readonly ConnectedAccount[]): AccountSource | null {
  const remembered = readRatingsSite();
  if (remembered && list.some((a) => a.source === remembered)) return remembered;
  return list[0]?.source ?? null;
}

async function gamesOf(list: readonly ConnectedAccount[]): Promise<GameRecord[]> {
  const lists = await Promise.all(list.map((a) => local.listGames(ownerKey(a.source, a.username))));
  return mergeGames(lists);
}

/**
 * Deletes an account's games beyond the newest KEEP_PER_ACCOUNT (Fable review A6-02), never one
 * that is analysed, opened, or waiting in the analysis queue. A failure leaves the games as they
 * are: the update itself went through.
 */
async function trim(owner: string): Promise<void> {
  await local.trimOwner(owner, queuedGames()).catch(() => {});
}

/**
 * Counts changes of the connected accounts. An update from the sites keeps the number it started
 * with and writes nothing once it differs (Fable review 1.1 B4-01).
 */
let generation = 0;

/** When the last update from the sites started (ms since 1970). */
let lastRefreshAt = 0;
export const RETURN_REFRESH_MS = 5 * 60 * 1000;

/** A Chess.com name saved in lower case is checked against the profile once a session. */
let chessComCaseChecked = false;

export const useApp = create<AppState>()((set, get) => {
  onWriteFailure(() => {
    if (get().storage === 'ok') set({ storage: 'saveFailed' });
  });

  // A Chess.com name saved before the app read its case from the profile ("someplayer"):
  // ask the profile for the case the site shows, and keep it.
  async function fixChessComCase(started: number) {
    const accounts = get().accounts;
    const name = accounts?.chesscom;
    if (!accounts || !name || chessComCaseChecked || name !== name.toLowerCase()) return;
    chessComCaseChecked = true;
    const result = await checkAccount('chesscom', name);
    if (started !== generation) return;
    if (result.ok && result.username !== name) {
      const next = { ...accounts, chesscom: result.username };
      await local.setAccounts(next);
      set({ accounts: next });
    }
  }

  return {
    loaded: false,
    accounts: null,
    games: [],
    otherGames: [],
    summaries: {},
    progress: {},
    ratings: {},
    ratingsSite: null,
    refresh: 'idle',
    failed: [],
    busy: [],
    storage: 'ok',

    dismissSaveFailed() {
      if (get().storage === 'saveFailed') set({ storage: 'ok' });
    },

    async load() {
      let saved;
      try {
        const accounts = await local.getAccounts();
        const list = connectedAccounts(accounts);
        const [games, otherGames, summaries, progress, ratings] = await Promise.all([
          gamesOf(list),
          local.listOtherGames(),
          local.listSummaries(),
          local.getProgress(),
          Promise.all(list.map((a) => local.getRatings(ownerKey(a.source, a.username)))),
        ]);
        saved = { accounts, list, games, otherGames, summaries, progress, ratings };
      } catch {
        // The browser does not let the app open its storage: say so instead of a blank page.
        set({ loaded: true, storage: 'unavailable' });
        return;
      }
      const { accounts, list, games, otherGames, summaries, progress, ratings } = saved;
      set({
        storage: 'ok',
        loaded: true,
        accounts,
        games,
        otherGames,
        summaries: Object.fromEntries(summaries.map((s) => [s.gameId, s])),
        progress,
        ratings: Object.fromEntries(
          list.flatMap((a, i) => {
            const saved = ratings[i];
            return saved ? [[a.source, saved]] : [];
          }),
        ),
        ratingsSite: pickRatingsSite(list),
      });
      // Dates saved before 1.1.1 that are not real dates are stored as none (B4-04); the lists
      // already read them as none, so nothing waits for this.
      void local.repairDates().catch(() => {});
      if (list.length > 0) void get().refreshFromSite();
    },

    async refreshFromSite() {
      const list = connectedAccounts(get().accounts);
      if (list.length === 0 || get().refresh === 'loading') return;
      set({ refresh: 'loading' });
      lastRefreshAt = Date.now();
      const started = generation;
      /** False once the accounts changed: nothing of this update may be kept then. */
      const current = () => started === generation;

      const failed: AccountSource[] = [];
      const busy: AccountSource[] = [];
      /** Whether any game was stored: if none, the lists on screen are already right (B5-01). */
      let stored = false;
      // The two sites in parallel; each site's own requests go one at a time (src/data/http.ts).
      await Promise.all(
        list.map(async ({ source, username }) => {
          const owner = ownerKey(source, username);
          // Lichess sends only the games since the newest one kept (Fable review A4-01).
          const newest = source === 'lichess' ? (await local.listGames(owner))[0] : undefined;
          const since = newest?.playedAt ? Date.parse(newest.playedAt) : undefined;
          // Chess.com has no "since": the months already stored are skipped instead, and in the
          // month read again, the games already stored (Fable review 1.1 B5-01).
          const done = source === 'chesscom' ? await local.getChessComMonths(owner) : [];
          const known =
            source === 'chesscom' ? new Set(await local.knownGameIds(owner)) : undefined;
          const [games, ratingsResult] = await Promise.all([
            source === 'lichess'
              ? // Every game since the last visit, not only the newest 50 (B5-03).
                fetchLichessGames(
                  username,
                  since !== undefined ? { since, catchUp: KEEP_PER_ACCOUNT } : {},
                ).then((result) => ({ result, closed: [] as string[] }))
              : fetchChessComRecent(username, { done, ...(known ? { known } : {}) }),
            fetchRatings(source, username),
          ]);
          const gamesResult = games.result;
          let ok = true;
          if (!current()) return;
          if (gamesResult.ok) {
            if (gamesResult.games.length > 0) {
              await local.putGames(gamesResult.games, owner);
              await trim(owner);
              stored = true;
            }
            await local.addChessComMonths(owner, games.closed);
          } else if (gamesResult.error.code !== 'no-games') {
            ok = false;
            if (gamesResult.error.code === 'rate-limited') busy.push(source);
          }
          if (!current()) return;
          if (ratingsResult.ok) {
            const before = await local.getRatings(owner);
            const shown = ratingsToShow(source, ratingsResult.ratings, before);
            if (!current()) return;
            await local.setRatings(owner, shown);
            set({ ratings: { ...get().ratings, [source]: shown } });
          } else {
            ok = false;
            if (ratingsResult.error.code === 'rate-limited' && !busy.includes(source)) {
              busy.push(source);
            }
          }
          if (!ok) failed.push(source);
        }),
      );

      if (!current()) return;
      await fixChessComCase(started);
      if (!current()) return;
      set({
        // Read again only when something was stored (Fable review 1.1 B5-01: reading 200 games
        // back and drawing the lists again cost seconds on a slow phone, for nothing).
        ...(stored
          ? {
              games: await gamesOf(connectedAccounts(get().accounts)),
              // A game opened earlier may now belong to an account, and so leave Others.
              otherGames: await local.listOtherGames(),
            }
          : {}),
        failed,
        busy,
        refresh: failed.length > 0 ? 'failed' : 'done',
      });
    },

    refreshOnReturn() {
      if (Date.now() - lastRefreshAt < RETURN_REFRESH_MS) return;
      void get().refreshFromSite();
    },

    stopUpdates() {
      generation += 1;
      set({ refresh: 'idle' });
    },

    async setAccounts(accounts) {
      get().stopUpdates();
      await local.setAccounts(accounts);
      // Ask the browser to keep the data instead of clearing it when space runs low or the site
      // is not visited for a while (Safari: 7 days). Fable review A6-02.
      if (accounts) void navigator.storage?.persist?.().catch(() => false);
      set({ games: [], ratings: {}, failed: [], busy: [], refresh: 'idle' });
      await get().load();
    },

    async reloadOtherGames() {
      try {
        set({ otherGames: await local.listOtherGames() });
      } catch {
        // Storage refused: the list stays as it was; the app already says storage is unavailable.
      }
    },

    setRatingsSite(site) {
      writeRatingsSite(site);
      set({ ratingsSite: site });
    },

    addSummary(summary) {
      set({ summaries: { ...get().summaries, [summary.gameId]: summary } });
    },

    saveProgress(gameId, progress) {
      const others = get().otherGames;
      const other = others.find((game) => game.id === gameId);
      set({
        progress: { ...get().progress, [gameId]: progress },
        // Others lists the game opened last first (local.listOtherGames orders it the same way).
        ...(other ? { otherGames: [other, ...others.filter((game) => game !== other)] } : {}),
      });
      // A failure is reported through onWriteFailure; the screen goes on.
      local.setProgress(gameId, progress).catch(() => {});
    },
  };
});
