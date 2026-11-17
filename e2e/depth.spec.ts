import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * The depth picked in Settings (owner, 1.1 round 1): a game analysed after the change is searched
 * at the new depth and keeps it with its result; a game analysed before keeps its result and is
 * not analysed again, not even when it is opened. Real engine, real browser.
 */

interface Saved {
  createdAt: string;
  engine: { depth: number };
  positions: { depth: number; lines: unknown[] }[];
}

/** The analysis saved on the device for `gameId`, or null. */
function savedAnalysis(page: Page, gameId: string): Promise<Saved | null> {
  return page.evaluate(
    (id) =>
      new Promise<Saved | null>((resolve, reject) => {
        const open = indexedDB.open('chessbyme');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction('analyses').objectStore('analyses').get(id);
          request.onsuccess = () => {
            open.result.close();
            resolve((request.result as Saved | undefined) ?? null);
          };
        };
      }),
    gameId,
  );
}

const OLD_GAME = 'lichess:LAGvRNey';
const panel = (page: Page) => page.locator('#review-panel');

test('depth - a new game is analysed at the depth picked, an analysed one is left as it was', async ({
  page,
}) => {
  await seed(page, '/settings');
  const before = await savedAnalysis(page, OLD_GAME);
  expect(before?.engine.depth).toBe(18);

  // The Depth row shows the default and offers the five depths.
  const depth = page.getByLabel('Depth');
  await expect(page.locator('span', { hasText: '18 · Default' })).toBeVisible();
  await expect(depth.locator('option')).toHaveText(['14', '16', '18 · Default', '20', '22']);
  await depth.selectOption('14');
  await expect(depth).toHaveValue('14');
  expect(await page.evaluate(() => localStorage.getItem('cbm.depth'))).toBe('14');

  // Still 14 after the app is opened again.
  await page.reload();
  await expect(page.getByLabel('Depth')).toHaveValue('14');

  // A new game, pasted in: analysed at 14.
  await page.goto('/search');
  await page.getByRole('button', { name: /Paste PGN/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('textbox').fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *');
  await sheet.getByRole('button', { name: 'Review' }).click();
  await page.waitForURL(/\/review\//);
  await expect(panel(page)).toContainText('Drag a piece to try your own move', {
    timeout: 120_000,
  });
  const newGame = decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1)!);
  await expect.poll(() => savedAnalysis(page, newGame)).not.toBeNull();
  const fresh = (await savedAnalysis(page, newGame))!;
  expect(fresh.engine.depth).toBe(14);
  // Every position the engine searched went to 14, not to 18.
  const searched = fresh.positions.filter((position) => position.lines.length > 0);
  expect(searched.length).toBeGreaterThan(0);
  for (const position of searched) expect(position.depth).toBe(14);

  // The game analysed before is opened: its result is shown as it was, never analysed again.
  await page.goto(`/review/${encodeURIComponent(OLD_GAME)}`);
  // Where the reader left it (move 16), labelled as saved at depth 18 (an Inaccuracy since the
  // 0.05 line of 1.1 round 4; it was Good before).
  await expect(panel(page)).toContainText('8... d5?!Inaccuracy');
  await page.waitForTimeout(2_000);
  await expect(page.getByText(/Analyzing/)).toHaveCount(0);
  const after = await savedAnalysis(page, OLD_GAME);
  expect(after?.createdAt).toBe(before?.createdAt);
  expect(after?.engine.depth).toBe(18);
});
