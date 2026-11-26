import { expect, test, type Locator } from '@playwright/test';
import { seed } from './support';

/**
 * Tap targets at least 44px high (1.2, DESIGN.md): measured where a finger lands, by asking the
 * page which element is under points above and below the control's centre, so an invisible
 * target (.tap-area) counts and a target cut by its holder does not.
 */
function hitHeight(control: Locator): Promise<number> {
  return control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hits = (dy: number) => {
      const top = document.elementFromPoint(x, y + dy);
      return !!top && el.contains(top);
    };
    let up = 0;
    while (up < 40 && hits(-(up + 1))) up++;
    let down = 0;
    while (down < 40 && hits(down + 1)) down++;
    return up + down + 1;
  });
}

test('tap targets - Recent Games, a My Games row and the Summary chips are 44px high', async ({
  page,
}) => {
  await seed(page, '/');
  const recent = page.getByRole('link', { name: 'Recent Games' });
  expect(await hitHeight(recent)).toBeGreaterThanOrEqual(44);

  await page.goto('/games');
  const row = page.getByRole('link', { name: /Loss · Rapid/ });
  expect(await hitHeight(row)).toBeGreaterThanOrEqual(44);

  await seed(page, '/review/lichess%3ALAGvRNey');
  await page.getByRole('tab', { name: 'Summary' }).click();
  const chip = page.locator('#review-panel').getByRole('button', { name: /16\.\.\. Ne5/ });
  expect(await hitHeight(chip)).toBeGreaterThanOrEqual(44);
});

test('tap targets - a move in the iPad move table is 44px high', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await seed(page, '/review/lichess%3ALAGvRNey');
  const move = page
    .getByRole('list', { name: 'All Moves' })
    .getByRole('button', { name: /^Nf3/ })
    .first();
  expect(await hitHeight(move)).toBeGreaterThanOrEqual(44);
});
