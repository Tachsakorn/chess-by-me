import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Chess.com game links (1.2): opened through a player's monthly archives on the public API. The
 * API is answered here from the real archive fixtures of src/data (hikaru, 2026/10 and 11); a
 * request to anything else of Chess.com fails the test.
 */
const fixture = (name: string) =>
  readFileSync(new URL(`../src/data/__fixtures__/${name}`, import.meta.url), 'utf8');
const ARCHIVES = JSON.parse(fixture('chesscom-archives.json')) as { archives: string[] };
const NEWEST = ARCHIVES.archives.at(-1)!;
const LINK = 'https://www.chess.com/game/live/188816899405';

async function chessCom(page: Page) {
  const asked: string[] = [];
  await page.route('https://api.chess.com/**', async (route) => {
    const url = route.request().url();
    asked.push(url);
    if (url === 'https://api.chess.com/pub/player/hikaru/games/archives')
      return route.fulfill({ json: ARCHIVES, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (url === NEWEST)
      return route.fulfill({
        body: fixture('chesscom-month.json'),
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    if (url === 'https://api.chess.com/pub/player/nobody/games/archives')
      return route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
    throw new Error(`unexpected request ${url}`);
  });
  return asked;
}

/** No account on the device (first launch), then the Search screen. */
async function search(page: Page) {
  await page.goto('/dev/seed/?none=1&go=%2Fsearch');
  await page.waitForURL(/\/search$/);
}

test('chesscom link - without a known player, asks for a name, then opens the game', async ({
  page,
}) => {
  const asked = await chessCom(page);
  await search(page);
  await page.getByRole('searchbox').fill(LINK);
  await expect(page.getByText('Type the username of either player.')).toBeVisible();
  expect(asked).toEqual([]); // nothing asked before a name is known

  const name = page.getByRole('textbox', { name: 'Chess.com username' });
  await expect(page.getByRole('button', { name: 'Find game' })).toBeDisabled();
  await name.fill('Hikaru');
  await page.getByRole('button', { name: 'Find game' }).click();
  await page.waitForURL(/\/review\/chesscom%3A/);
  await expect(page.locator('h1')).toHaveText('Game Review');
  expect(asked).toEqual(['https://api.chess.com/pub/player/hikaru/games/archives', NEWEST]);
});

test('chesscom link - the player named in a shared link is used at once', async ({ page }) => {
  await chessCom(page);
  await search(page);
  await page.getByRole('searchbox').fill(`${LINK}?username=hikaru`);
  await page.waitForURL(/\/review\/chesscom%3A/);
});

test('chesscom link - an unknown player, and a game not in the player’s months', async ({
  page,
}) => {
  await chessCom(page);
  await search(page);
  await page.getByRole('searchbox').fill(LINK);
  await page.getByRole('textbox', { name: 'Chess.com username' }).fill('nobody');
  await page.getByRole('button', { name: 'Find game' }).click();
  await expect(page.getByText('No Chess.com player named “nobody”.')).toBeVisible();

  // Newer than every game of hikaru's newest month: not in the archives.
  await page.getByRole('searchbox').fill('https://www.chess.com/game/live/999999999999');
  await expect(page.getByText('Type the username of either player.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Chess.com username' }).fill('hikaru');
  await page.getByRole('button', { name: 'Find game' }).click();
  await expect(page.getByText(/isn't in hikaru's games./)).toBeVisible();
});
