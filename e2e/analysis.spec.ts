import { expect, test } from '@playwright/test';
import { savedAnalyses, seed } from './support';

// Fable review A1-03: without the opening book an analysis was saved without book moves, for good.
test('analysis - an opening book that cannot load fails the run, and a retry works', async ({
  page,
}) => {
  await seed(page, '/games');
  await page.route('**/openings*', (route) => route.abort());
  await page.goto('/review/lichess%3Af6WkG3uO');
  const retry = page.getByRole('button', { name: "Analysis didn't finish. Tap to try again." });
  await expect(retry).toBeVisible({ timeout: 30_000 });
  expect(await savedAnalyses(page, 'lichess:f6WkG3uO')).toBe(0);
  await page.unroute('**/openings*');
  await retry.click();
  await expect(page.getByText(/Downloading the engine|Analyzing/)).toBeVisible();
});

// Fable review A1-02: a move could show Brilliant while analysing and Best at the end.
test('analysis - every label shown while analysing is the final label', async ({ page }) => {
  // Wide: the move table beside the board names the category of every reviewed move.
  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page, '/games');
  await page.goto('/review/lichess%3AHKl8S22m');
  /** Each move of the table as read out: "Qxg1+, Miss" once it is reviewed. */
  const read = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[class*="tableMove"]')].map((item) => item.textContent ?? ''),
    );
  const seen = new Map<number, Set<string>>();
  const deadline = Date.now() + 150_000;
  for (;;) {
    const items = await read();
    items.forEach((text, index) => {
      if (!text.includes(',')) return; // not reviewed yet
      const labels = seen.get(index) ?? new Set<string>();
      labels.add(text);
      seen.set(index, labels);
    });
    const busy = await page.getByText(/Analyzing|Downloading/).count();
    if ((busy === 0 && items.length > 0 && seen.size === items.length) || Date.now() > deadline) {
      break;
    }
    await page.waitForTimeout(250);
  }
  const final = await read();
  expect(final.length).toBeGreaterThan(0);
  expect(final.every((text) => text.includes(','))).toBe(true);
  expect([...seen].filter(([, labels]) => labels.size > 1)).toEqual([]);
  expect(await savedAnalyses(page, 'lichess:HKl8S22m')).toBe(1);
});
