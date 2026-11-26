import { expect, test, type Page } from '@playwright/test';

/**
 * The device storage of src/data/local.ts in a real browser's IndexedDB (Node has none):
 * the move of other games to their own owner (Fable review A6-06), the limit per account
 * (A6-02) and the Chess.com months kept between updates (A4-01). The page imports the module
 * through the dev server.
 */

type Local = typeof import('../src/data/local');

/** A stand-in game: storage only reads `id` and `playedAt`. */
const game = (id: string, day: number) => ({
  id,
  playedAt: `2026-11-${String(day).padStart(2, '0')}T12:00:00Z`,
});

async function freshPage(page: Page): Promise<void> {
  // A development page that does not open the app's storage, so nothing holds the database.
  await page.goto('/dev/badges/');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('chessbyme');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
  );
}

test('version 1 storage: other games move to their own owner and can be listed', async ({
  page,
}) => {
  await freshPage(page);
  // The database as version 1 left it: an other game with owner null, beside an account's game.
  await page.evaluate(
    ({ other, own }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('chessbyme', 1);
        open.onupgradeneeded = () => {
          const db = open.result;
          db.createObjectStore('games', { keyPath: 'id' }).createIndex('owner', 'owner');
          db.createObjectStore('analyses', { keyPath: 'gameId' });
          db.createObjectStore('summaries', { keyPath: 'gameId' });
          db.createObjectStore('kv');
        };
        open.onsuccess = () => {
          const tx = open.result.transaction('games', 'readwrite');
          tx.objectStore('games').put({
            id: other.id,
            owner: null,
            playedAt: other.playedAt,
            game: other,
          });
          tx.objectStore('games').put({
            id: own.id,
            owner: 'lichess:me',
            playedAt: own.playedAt,
            game: own,
          });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { other: game('pgn:old', 3), own: game('lichess:a', 4) },
  );

  const result = await page.evaluate(async () => {
    const MODULE_PATH = '/src/data/local.ts'; // a page address, not a file for the type checker
    const { local } = (await import(MODULE_PATH)) as Local;
    return {
      others: (await local.listOtherGames()).map((g) => g.id),
      mine: (await local.listGames('lichess:me')).map((g) => g.id),
    };
  });
  expect(result).toEqual({ others: ['pgn:old'], mine: ['lichess:a'] });
});

test('other games: listed by when they were opened; an account keeps its own games', async ({
  page,
}) => {
  await freshPage(page);
  const result = await page.evaluate(
    async ({ a, b, c }) => {
      const MODULE_PATH = '/src/data/local.ts'; // a page address, not a file for the type checker
      const { local } = (await import(MODULE_PATH)) as Local;
      const as = <T>(value: unknown) => value as T;
      await local.putGames(as([c]), 'lichess:me');
      await local.putGames(as([a]), null);
      await new Promise((r) => setTimeout(r, 5));
      await local.putGames(as([b]), null);
      await new Promise((r) => setTimeout(r, 5));
      await local.putGames(as([c]), null); // the user's own game, found through Search
      const first = (await local.listOtherGames()).map((g) => g.id);
      await new Promise((r) => setTimeout(r, 5));
      await local.putGames(as([a]), null); // opened again
      const second = (await local.listOtherGames()).map((g) => g.id);
      const mine = (await local.listGames('lichess:me')).map((g) => g.id);
      return { first, second, mine };
    },
    { a: game('pgn:a', 1), b: game('pgn:b', 9), c: game('lichess:c', 5) },
  );
  expect(result.first).toEqual(['pgn:b', 'pgn:a']);
  expect(result.second).toEqual(['pgn:a', 'pgn:b']);
  expect(result.mine).toEqual(['lichess:c']);
});

test('the limit per account drops the oldest games, never analysed, opened or queued ones', async ({
  page,
}) => {
  await freshPage(page);
  const result = await page.evaluate(
    async (games) => {
      const MODULE_PATH = '/src/data/local.ts'; // a page address, not a file for the type checker
      const { local } = (await import(MODULE_PATH)) as Local;
      await local.putGames(games as never, 'lichess:me');
      const theirs = games.map((g) => ({ ...g, id: `x${g.id}` }));
      await local.putGames(theirs as never, 'chesscom:other-account');
      // An analysis written straight into the store: the contract check is not under test here.
      const db = await new Promise<IDBDatabase>((resolve) => {
        const open = indexedDB.open('chessbyme');
        open.onsuccess = () => resolve(open.result);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction('analyses', 'readwrite');
        tx.objectStore('analyses').put({ gameId: 'g1' });
        tx.oncomplete = () => resolve();
      });
      db.close();
      await local.setProgress('g2', { ply: 0, flipped: false, at: 1 });
      // g1 analysed, g2 opened, g3 waiting in the queue; keep the newest two of the rest.
      const dropped = await local.trimOwner('lichess:me', new Set(['g3']), 2);
      return {
        dropped,
        left: (await local.listGames('lichess:me')).map((g) => g.id).sort(),
        theirs: (await local.listGames('chesscom:other-account')).length,
        again: await local.trimOwner('lichess:me', new Set(['g3']), 2),
        // 1.1.1 (B5-01): the dropped games are still known, so an update does not read them again;
        // until the account is disconnected.
        known: (await local.knownGameIds('lichess:me')).sort(),
        afterDisconnect:
          (await local.deleteOwner('lichess:me'), (await local.knownGameIds('lichess:me')).length),
      };
    },
    [1, 2, 3, 4, 5, 6, 7].map((day) => game(`g${day}`, day)),
  );
  // g7 and g6 are the newest two; g5 and g4 go; g1, g2, g3 stay.
  // Another account's games are not touched.
  expect(result).toEqual({
    dropped: 2,
    left: ['g1', 'g2', 'g3', 'g6', 'g7'],
    theirs: 7,
    again: 0,
    known: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'],
    afterDisconnect: 0,
  });
});

test('the Chess.com months kept for an account go when the account is disconnected', async ({
  page,
}) => {
  await freshPage(page);
  const result = await page.evaluate(async () => {
    const MODULE_PATH = '/src/data/local.ts'; // a page address, not a file for the type checker
    const { local } = (await import(MODULE_PATH)) as Local;
    const month = (m: string) => `https://api.chess.com/pub/player/me/games/2026/${m}`;
    await local.addChessComMonths('chesscom:me', [month('09')]);
    await local.addChessComMonths('chesscom:me', [month('10'), month('09')]);
    await local.addChessComMonths('chesscom:you', [month('10')]);
    const before = await local.getChessComMonths('chesscom:me');
    await local.deleteOwner('chesscom:me');
    return {
      before,
      after: await local.getChessComMonths('chesscom:me'),
      other: await local.getChessComMonths('chesscom:you'),
    };
  });
  expect(result.before).toEqual([
    'https://api.chess.com/pub/player/me/games/2026/09',
    'https://api.chess.com/pub/player/me/games/2026/10',
  ]);
  expect(result.after).toEqual([]);
  expect(result.other).toEqual(['https://api.chess.com/pub/player/me/games/2026/10']);
});

test('other games: leaving a review of one moves it first, without saving it again', async ({
  page,
}) => {
  await freshPage(page);
  const order = await page.evaluate(
    async ({ a, b }) => {
      const MODULE_PATH = '/src/data/local.ts'; // a page address, not a file for the type checker
      const { local } = (await import(MODULE_PATH)) as Local;
      await local.putGames([a] as never, null);
      await new Promise((r) => setTimeout(r, 5));
      await local.putGames([b] as never, null);
      const before = (await local.listOtherGames()).map((g) => g.id);
      // Reopened from the list and left: only the place in the game is saved.
      await local.setProgress('pgn:a', { ply: 3, flipped: false, at: Date.now() + 10 });
      const after = (await local.listOtherGames()).map((g) => g.id);
      return { before, after };
    },
    { a: game('pgn:a', 1), b: game('pgn:b', 2) },
  );
  expect(order).toEqual({ before: ['pgn:b', 'pgn:a'], after: ['pgn:a', 'pgn:b'] });
});

test('the ids of dropped games are capped at the newest 1,000 per account, and go with it', async ({
  page,
}) => {
  // 1.1.1 (owner): the list that keeps Chess.com from reading dropped games again must not grow.
  await freshPage(page);
  const result = await page.evaluate(async () => {
    const MODULE_PATH = '/src/data/local.ts';
    const { local } = (await import(MODULE_PATH)) as Local;
    const batch = (from: number, day: number) =>
      Array.from({ length: 700 }, (_, i) => ({
        id: `chesscom:g${from + i}`,
        playedAt: `2026-${String(day).padStart(2, '0')}-01T12:00:00Z`,
      }));
    // Two updates, each of 700 games none of which is kept (keep 0): 1,400 dropped in all.
    await local.putGames(batch(0, 9) as never, 'chesscom:me');
    await local.trimOwner('chesscom:me', new Set(), 0);
    await local.putGames(batch(700, 10) as never, 'chesscom:me');
    await local.trimOwner('chesscom:me', new Set(), 0);
    const known = await local.knownGameIds('chesscom:me');
    const size = JSON.stringify(known).length;
    await local.deleteOwner('chesscom:me');
    return {
      count: known.length,
      newestAllKept: Array.from({ length: 700 }, (_, i) => `chesscom:g${700 + i}`).every((id) =>
        known.includes(id),
      ),
      bytes: size,
      afterDisconnect: (await local.knownGameIds('chesscom:me')).length,
    };
  });
  expect(result.count).toBe(1000);
  expect(result.newestAllKept).toBe(true);
  expect(result.afterDisconnect).toBe(0);
  console.log(`1,000 remembered ids take ${result.bytes} bytes as JSON`);
});
