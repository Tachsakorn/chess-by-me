import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * Saved analyses made under older labelling rules (1.1 round 4: RULES_VERSION 6). Opening the app
 * changes nothing. Since 1.1.1 (Fable review 1.1 B2-01) a game opened is rebuilt from its own saved
 * evaluations, at once and without the engine; only an analysis that cannot be rebuilt (positions
 * missing) is analysed again. Real browser; the engine runs only in the last test.
 */

interface Saved {
  rulesVersion?: number;
  createdAt: string;
  categories: string[];
  white: number;
}

/** What is saved for `gameId`. */
function saved(page: Page, gameId: string): Promise<Saved> {
  return page.evaluate(
    (id) =>
      new Promise<Saved>((resolve) => {
        const open = indexedDB.open('chessbyme');
        open.onsuccess = () => {
          const get = open.result.transaction('analyses').objectStore('analyses').get(id);
          get.onsuccess = () => {
            open.result.close();
            const value = get.result as {
              rulesVersion?: number;
              createdAt: string;
              moves: { category: string }[];
              white: { accuracy: number };
            };
            resolve({
              rulesVersion: value.rulesVersion,
              createdAt: value.createdAt,
              categories: value.moves.map((m) => m.category),
              white: value.white.accuracy,
            });
          };
        };
      }),
    gameId,
  );
}

/**
 * Turns the saved analysis of `gameId` into one of the rules before (5): every label "good", as
 * older rules may label differently. Only the first `keep` positions when it is not 0 (a review
 * shorter than its game).
 */
function makeOld(page: Page, gameId: string, keep = 0): Promise<void> {
  return page.evaluate(
    ([id, positions]) =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('chessbyme');
        open.onsuccess = () => {
          const store = open.result.transaction('analyses', 'readwrite').objectStore('analyses');
          const get = store.get(id);
          get.onsuccess = () => {
            const value = get.result as {
              moves: { category: string }[];
              positions: unknown[];
            };
            const put = store.put({
              ...value,
              rulesVersion: 5,
              moves: value.moves.map((m) => ({ ...m, category: 'good', tags: [] })),
              ...(positions ? { positions: value.positions.slice(0, positions) } : {}),
            });
            put.onsuccess = () => {
              open.result.close();
              resolve();
            };
          };
        };
      }),
    [gameId, keep] as const,
  );
}

const A = 'lichess:LAGvRNey';
const B = 'lichess:HKl8S22m';

test('rules version - an older analysis is rebuilt when its game is opened, without the engine', async ({
  page,
}) => {
  // No game left half-read: the Continue card would rebuild that one (next test).
  await seed(page, '/', 'LAGvRNey,HKl8S22m', 0);
  const current = await saved(page, A);
  await makeOld(page, A);
  await makeOld(page, B);

  // The app is opened again on Home and on Games: nothing changes.
  await page.reload();
  await page.locator('h1').first().waitFor();
  await page.goto('/games');
  await page.locator('h1').first().waitFor();
  await page.waitForTimeout(2_000);
  await expect(page.getByText(/Analyzing/)).toHaveCount(0);
  expect((await saved(page, A)).rulesVersion).toBe(5);
  expect((await saved(page, B)).rulesVersion).toBe(5);

  // Game A is opened: it shows at once, rebuilt under the current rules from its own positions.
  // No engine worker starts and no engine file or opening book is asked for.
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  const asked: string[] = [];
  page.on('request', (request) => {
    if (/stockfish|openings/.test(request.url())) asked.push(request.url());
  });
  await page.goto(`/review/${encodeURIComponent(A)}`);
  await expect.poll(async () => (await saved(page, A)).rulesVersion, { timeout: 10_000 }).toBe(6);
  const rebuilt = await saved(page, A);
  expect(rebuilt.categories).toEqual(current.categories);
  // The fixture was made in Node; the browser's floating point may differ in the last digits.
  expect(rebuilt.white).toBeCloseTo(current.white, 9);
  expect(rebuilt.createdAt).toBe(current.createdAt);
  await expect(page.getByText('Start of the game')).toBeVisible();
  await expect(page.getByText(/Analyzing/)).toHaveCount(0);
  await page.waitForTimeout(1_000);
  expect(workers).toEqual([]);
  expect(asked).toEqual([]);
  // Game B is left alone until it is opened.
  expect((await saved(page, B)).rulesVersion).toBe(5);
});

test('rules version - the Continue card shows the marks of the current rules', async ({ page }) => {
  // The user left game A at 8... d5, an Inaccuracy under the current rules ("good" in the copy).
  await seed(page, '/', 'LAGvRNey', 16);
  await makeOld(page, A);
  await page.reload();
  await expect(page.getByText('Paused at 8... d5?!')).toBeVisible();
  expect((await saved(page, A)).rulesVersion).toBe(6);
});

test('rules version - an older analysis with positions missing is analysed again', async ({
  page,
}) => {
  await seed(page, '/', 'HKl8S22m');
  const before = await saved(page, B);
  await makeOld(page, B, 20);
  await page.goto(`/review/${encodeURIComponent(B)}`);
  await expect.poll(async () => (await saved(page, B)).rulesVersion, { timeout: 300_000 }).toBe(6);
  const after = await saved(page, B);
  expect(after.createdAt).not.toBe(before.createdAt);
  expect(after.categories).toHaveLength(before.categories.length);
});
