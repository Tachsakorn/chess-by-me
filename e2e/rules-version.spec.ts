import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * Saved analyses made under older labelling rules (1.1 round 4: the error lines moved and
 * RULES_VERSION went to 6). Opening the app analyses nothing; a game is analysed again only when
 * it is opened, and only that game. Real engine, real browser.
 */

/** The rulesVersion and createdAt of the analysis saved for `gameId`. */
function saved(page: Page, gameId: string): Promise<{ rulesVersion?: number; createdAt: string }> {
  return page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const open = indexedDB.open('chessbyme');
        open.onsuccess = () => {
          const get = open.result.transaction('analyses').objectStore('analyses').get(id);
          get.onsuccess = () => {
            open.result.close();
            const value = get.result as { rulesVersion?: number; createdAt: string };
            resolve({ rulesVersion: value.rulesVersion, createdAt: value.createdAt });
          };
        };
      }),
    gameId,
  );
}

/** Marks the saved analysis of `gameId` as made under the rules before this round (5). */
function makeOld(page: Page, gameId: string): Promise<void> {
  return page.evaluate(
    (id) =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('chessbyme');
        open.onsuccess = () => {
          const store = open.result.transaction('analyses', 'readwrite').objectStore('analyses');
          const get = store.get(id);
          get.onsuccess = () => {
            const put = store.put({ ...get.result, rulesVersion: 5 });
            put.onsuccess = () => {
              open.result.close();
              resolve();
            };
          };
        };
      }),
    gameId,
  );
}

const A = 'lichess:LAGvRNey';
const B = 'lichess:HKl8S22m';

test('rules version - an older analysis is redone when its game is opened, one game at a time', async ({
  page,
}) => {
  await seed(page, '/', 'LAGvRNey,HKl8S22m');
  await makeOld(page, A);
  await makeOld(page, B);
  const stamp = (await saved(page, A)).createdAt;

  // The app is opened again on Home and on Games: nothing is analysed.
  await page.reload();
  await page.locator('h1').first().waitFor();
  await page.goto('/games');
  await page.locator('h1').first().waitFor();
  await page.waitForTimeout(3_000);
  await expect(page.getByText(/Analyzing/)).toHaveCount(0);
  expect((await saved(page, A)).rulesVersion).toBe(5);
  expect((await saved(page, B)).rulesVersion).toBe(5);

  // Game A is opened: it is analysed again under the current rules. Game B is left alone.
  await page.goto(`/review/${encodeURIComponent(A)}`);
  await expect.poll(async () => (await saved(page, A)).rulesVersion, { timeout: 300_000 }).toBe(6);
  expect((await saved(page, A)).createdAt).not.toBe(stamp);
  expect((await saved(page, B)).rulesVersion).toBe(5);
});
