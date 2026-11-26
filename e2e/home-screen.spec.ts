import { expect, test } from '@playwright/test';

/** Settings › Add to Home Screen (1.2): only on an iPhone or iPad, in the browser. */
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

test.describe('on an iPhone', () => {
  test.use({ userAgent: IPHONE, hasTouch: true });

  test('home screen - Settings leads to the four steps', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('link', { name: 'Add to Home Screen' }).click();
    await expect(page).toHaveURL(/\/settings\/home-screen$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Add to Home Screen');
    await expect(page.getByRole('listitem')).toHaveCount(4);
    await expect(page.getByText('Tap “Add to Home Screen”.', { exact: false })).toBeVisible();
  });
});

test('home screen - no such row on a computer', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add to Home Screen' })).toHaveCount(0);
});
