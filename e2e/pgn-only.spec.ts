import { expect, test, type Page } from '@playwright/test';

/**
 * Someone who only pastes PGN, with no account (1.1.1, Fable review 1.1 B4-03): Settings is
 * reached from Connect and from Search, the way Home reaches it, and My Games shows the games
 * they opened.
 */
async function noAccount(page: Page, go: string): Promise<void> {
  await page.route('**/engines/**', (route) => route.abort()); // no analysis needed here
  await page.goto(`/dev/seed/?none=1&go=${encodeURIComponent(go)}`);
  await page.waitForURL((url) => !url.pathname.startsWith('/dev/'));
  await page.locator('h1').first().waitFor();
}

test('pgn only - Settings from Connect and from Search', async ({ page }) => {
  await noAccount(page, '/connect');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.goto('/search');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  // Privacy and "Clear saved data" are there too.
  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('button', { name: 'Clear saved data' })).toBeVisible();
});

test('pgn only - My Games shows the games opened, without an account', async ({ page }) => {
  await noAccount(page, '/search');
  await page.getByRole('button', { name: /Paste PGN/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox')
    .fill('[White "Pasted White"]\n[Black "Pasted Black"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *');
  await page.getByRole('dialog').getByRole('button', { name: 'Review' }).click();
  await page.waitForURL(/\/review\//);
  await page.goto('/games');
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.getByRole('link', { name: /Pasted White/ })).toBeVisible();
  // No account filters to choose from; a way to connect one instead.
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.getByRole('link', { name: 'Connect your chess account' }).click();
  await expect(page).toHaveURL(/\/connect$/);
});

test('pgn only - with an account nothing changes on Search, and Home keeps its avatar', async ({
  page,
}) => {
  await page.goto('/dev/seed/?go=%2Fsearch');
  await page.waitForURL(/\/search$/);
  await page.locator('h1').first().waitFor();
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'My account' })).toHaveText('N');
});
