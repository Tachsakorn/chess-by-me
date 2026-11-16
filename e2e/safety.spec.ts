import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { outsideRequests, seed } from './support';

const ORIGIN = 'http://localhost:5317';

// Fable review A2-01: "Paste a game link" sent whatever was on the clipboard to both sites.
test('safety - plain text on the clipboard is not sent anywhere', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  await page.goto('/search');
  await page.evaluate(() => navigator.clipboard.writeText('Hunter2Secret99'));
  const sent = outsideRequests(page);
  await page.getByRole('button', { name: /Paste a game link/ }).click();
  await expect(page.getByText("That isn't a game link.")).toBeVisible();
  await page.waitForTimeout(1500); // longer than Search's pause after typing
  expect(sent).toEqual([]);
  await expect(page.getByRole('searchbox')).toHaveValue('');
});

test('safety - a PGN on the clipboard opens on the device, without a request', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  const pgn = readFileSync(
    new URL('../fixtures/lichess-f6WkG3uO/game.pgn', import.meta.url),
    'utf8',
  );
  await page.goto('/search');
  await page.evaluate((text) => navigator.clipboard.writeText(text), pgn);
  await page.route('**/engines/**', (route) => route.abort()); // no analysis needed here
  const sent = outsideRequests(page);
  await page.getByRole('button', { name: /Paste a game link/ }).click();
  await expect(page).toHaveURL(/\/review\//);
  expect(sent).toEqual([]);
});

// Fable review A3-02: React Router's developer page (English, with a stack trace) was shown.
test('safety - a broken address or a broken saved game shows the designed error screen', async ({
  page,
}) => {
  await seed(page, '/');
  // Through the app's own router: the dev server refuses such an address before the app runs.
  await page.evaluate(() => {
    history.pushState({}, '', '/review/%E0%A4%A');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForTimeout(500);
  await expect(page.getByText('Unexpected Application Error')).toHaveCount(0);

  // A saved game the code cannot read (as after a future change of format).
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('chessbyme');
        open.onsuccess = () => {
          const tx = open.result.transaction('games', 'readwrite');
          tx.objectStore('games').put({
            id: 'pgn:broken',
            owner: null,
            playedAt: null,
            game: { id: 'pgn:broken', moves: null },
          });
          tx.oncomplete = () => resolve();
        };
      }),
  );
  await page.goto('/review/pgn%3Abroken');
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Home' })).toBeVisible();
  await expect(page.getByText('Unexpected Application Error')).toHaveCount(0);
});

// Fable review A6-01: with storage blocked (Safari, "Block All Cookies") Home was a blank page.
test('safety - a browser that refuses storage gets a screen that says so', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: "This browser isn't letting Chess by me save" }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
