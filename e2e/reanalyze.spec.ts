import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * The depth pill of the review (1.2): it shows the depth of the analysis on screen, and a tap
 * offers to analyse again at the depth set in Settings (real engine), warns at 20 and 22, and
 * leads to Settings when the depth would not change. LAGvRNey's saved analysis is at depth 18.
 */
const REVIEW = '/review/lichess%3ALAGvRNey';
const GAME = 'lichess:LAGvRNey';

function savedDepth(page: Page): Promise<number | null> {
  return page.evaluate(
    (id) =>
      new Promise<number | null>((resolve) => {
        const open = indexedDB.open('chessbyme');
        open.onsuccess = () => {
          const request = open.result.transaction('analyses').objectStore('analyses').get(id);
          request.onsuccess = () => {
            open.result.close();
            const saved = request.result as { engine: { depth: number } } | undefined;
            resolve(saved ? saved.engine.depth : null);
          };
        };
      }),
    GAME,
  );
}

const setDepth = (page: Page, depth: number) =>
  page.addInitScript((d) => localStorage.setItem('cbm.depth', String(d)), depth);
const pill = (page: Page) => page.locator('header').getByText(/^Depth \d+$/);
const sheet = (page: Page) => page.getByRole('alertdialog');

test('reanalyze - the pill shows the depth and analyses again at the depth of Settings', async ({
  page,
}) => {
  await setDepth(page, 14);
  await seed(page, REVIEW);
  await expect(pill(page)).toHaveText('Depth 18');

  await page.getByRole('button', { name: 'Analyzed at depth 18. Analyze again' }).click();
  await expect(sheet(page)).toContainText('Analyze again at depth 14?');
  await expect(sheet(page)).toContainText('This game was analyzed at depth 18.');
  await expect(sheet(page)).not.toContainText('as long as depth 18');
  await sheet(page).getByRole('button', { name: 'Analyze again' }).click();

  // The new run is on screen at once, with its own depth, and is saved when done.
  await expect(pill(page)).toHaveText('Depth 14');
  await expect(page.locator('#review-panel')).toContainText('Analyzing', { timeout: 30_000 });
  await expect.poll(() => savedDepth(page), { timeout: 120_000 }).toBe(14);
  await expect(
    page.getByRole('button', { name: 'Analyzed at depth 14. Analyze again' }),
  ).toBeVisible();
});

test('reanalyze - depth 22 is warned about, and Cancel changes nothing', async ({ page }) => {
  await setDepth(page, 22);
  await seed(page, REVIEW);
  await pill(page).click();
  await expect(sheet(page)).toContainText('Depth 22 takes about 4 to 5 times as long as depth 18.');
  await sheet(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(pill(page)).toHaveText('Depth 18');
  expect(await savedDepth(page)).toBe(18);
});

test('reanalyze - at the depth it already has, the sheet leads to Settings', async ({ page }) => {
  await seed(page, REVIEW); // Settings at the default, 18
  await pill(page).click();
  await expect(sheet(page)).toContainText('Analyzed at depth 18');
  await sheet(page).getByRole('button', { name: 'Open Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('reanalyze - Settings warns under the Depth row at 20 and 22 only', async ({ page }) => {
  await page.goto('/settings');
  const depth = page.getByRole('combobox', { name: 'Depth' });
  await depth.selectOption('20');
  await expect(depth).toHaveAccessibleDescription(
    'Depth 20 takes about twice as long as depth 18.',
  );
  await depth.selectOption('16');
  await expect(page.getByText(/as long as depth 18/)).toHaveCount(0);
});
