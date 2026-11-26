import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * The browser closes the app's database while the app stays open (1.1.1, Fable review 1.1
 * B4-05): here by clearing the site's IndexedDB from the browser (CDP), which closes every open
 * connection, as a browser does when it clears site data or evicts it. The app must open the
 * database again on its next use; a screen that still fails shows the normal error state, never
 * a blank page or buttons that stay grey.
 */
async function closeDatabase(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', {
    origin: new URL(page.url()).origin,
    storageTypes: 'indexeddb',
  });
  await page.waitForTimeout(500);
}

const inApp = (page: Page, to: string) =>
  page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, to);

test('db closed - opening a review afterwards never leaves a blank page', async ({ page }) => {
  await seed(page, '/games');
  await closeDatabase(page);
  // Clearing the site's database deletes the game too: the app goes Home, as for any address of
  // a game that is not kept. On 1.1.0 this page stayed blank.
  await inApp(page, `/review/${encodeURIComponent('lichess:LAGvRNey')}`);
  await expect(page.locator('#review-panel').or(page.locator('h1')).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
});

test('db closed - Disconnect finishes instead of freezing', async ({ page }) => {
  await seed(page, '/settings');
  await closeDatabase(page);
  await page.getByRole('link', { name: /Lichess/ }).click();
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('button', { name: 'Disconnect and delete' }).click();
  await page.waitForURL(/\/connect$/, { timeout: 10_000 });
  // Started again, the app has no account: the deletion really happened.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Connect your chess account' })).toBeVisible();
});

test('db closed - a game pasted afterwards is analysed and saved', async ({ page }) => {
  await seed(page, '/games');
  await closeDatabase(page);
  await inApp(page, '/search');
  await page.getByRole('button', { name: /Paste PGN/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox')
    .fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *');
  await page.getByRole('dialog').getByRole('button', { name: 'Review' }).click();
  await expect(page.locator('#review-panel')).toContainText(/Drag a piece|didn.t finish/, {
    timeout: 120_000,
  });
  await expect(page.locator('#review-panel')).toContainText('Drag a piece');
  await expect(page.getByText("Couldn't save on this device")).toHaveCount(0);
  const saved = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('chessbyme');
        open.onsuccess = () => {
          const count = open.result.transaction('analyses').objectStore('analyses').count();
          count.onsuccess = () => resolve(count.result);
        };
      }),
  );
  expect(saved).toBe(1);
});

/** After the close, the browser refuses to open the database again (storage blocked or broken). */
async function refuseDatabase(page: Page): Promise<void> {
  await page.evaluate(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException('refused for the test', 'UnknownError');
    };
  });
}

test('db closed and refused - the review and Disconnect show the error state', async ({ page }) => {
  await seed(page, '/games');
  await refuseDatabase(page);
  await closeDatabase(page);
  await inApp(page, `/review/${encodeURIComponent('lichess:LAGvRNey')}`);
  await expect(page.getByText('Something went wrong')).toBeVisible({ timeout: 10_000 });

  await seed(page, '/settings');
  await refuseDatabase(page);
  await closeDatabase(page);
  await page.getByRole('link', { name: /Lichess/ }).click();
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('button', { name: 'Disconnect and delete' }).click();
  await expect(page.getByText('Something went wrong')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Back to Home' })).toBeVisible();
});
