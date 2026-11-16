import { expect, test } from '@playwright/test';
import { seed } from './support';

// Fable review A7-01: on iPad landscape heights of 760-815px Home's last lines were under the
// menu bar, and the page could not scroll.
const SIZES = [
  [1024, 768],
  [1180, 790],
  [1080, 810],
  [1180, 820],
] as const;

for (const [width, height] of SIZES) {
  test(`layout - Home at ${width}x${height}: no text under the menu bar`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await seed(page, '/', 'LAGvRNey,HKl8S22m,f6WkG3uO');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const { lowest, barTop } = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('a')].filter((el) =>
        /^(Home|My Games|Courses|Search)$/.test(el.textContent?.trim() ?? ''),
      );
      const bar = tabs[0]?.parentElement?.closest('nav, div') ?? null;
      const top = Math.min(...tabs.map((el) => el.getBoundingClientRect().top));
      let low = 0;
      for (const el of document.querySelectorAll('main p, main h2, main h3')) {
        if (bar?.contains(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) low = Math.max(low, rect.bottom);
      }
      return { lowest: low, barTop: top };
    });
    expect(barTop).toBeLessThan(height);
    expect(lowest).toBeLessThanOrEqual(barTop);
  });
}
