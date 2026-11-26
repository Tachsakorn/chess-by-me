import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * The short game addresses (1.2): chessby.me/lichess/<id>, /chesscom/<id>, /chesscom/daily/<id>.
 * Lichess and Chess.com are answered here from the recorded fixtures of src/data; any other
 * request to those sites fails the test (the seeded account's own update is refused).
 */
const fixture = (name: string) =>
  readFileSync(new URL(`../src/data/__fixtures__/${name}`, import.meta.url), 'utf8');
const lichessGame = JSON.parse(fixture('lichess-user.ndjson').split('\n')[0]!) as { id: string };
const ARCHIVES = JSON.parse(fixture('chesscom-archives.json')) as { archives: string[] };
const NEWEST = ARCHIVES.archives.at(-1)!;
const CORS = { 'Access-Control-Allow-Origin': '*' };

async function sites(page: Page) {
  const asked: string[] = [];
  await page.route(/^https:\/\/(lichess\.org|api\.chess\.com)\//, async (route) => {
    const url = route.request().url();
    // The seeded account's own update (games, ratings) is not part of this: refused, not counted.
    if (/^https:\/\/lichess\.org\/api\/(games\/)?user\//.test(url)) return route.abort();
    asked.push(url);
    if (url.startsWith(`https://lichess.org/game/export/${lichessGame.id}`))
      return route.fulfill({ json: lichessGame, headers: CORS });
    if (url === 'https://api.chess.com/pub/player/hikaru/games/archives')
      return route.fulfill({ json: ARCHIVES, headers: CORS });
    if (url === NEWEST)
      return route.fulfill({
        body: fixture('chesscom-month.json'),
        contentType: 'application/json',
        headers: CORS,
      });
    throw new Error(`unexpected request ${url}`);
  });
  return asked;
}

test('game address - a Lichess game already on the device opens without the network', async ({
  page,
}) => {
  const asked = await sites(page);
  await seed(page, '/');
  await page.goto('/lichess/LAGvRNey');
  await page.waitForURL(/\/review\/lichess%3ALAGvRNey$/);
  expect(asked).toEqual([]);
  // The address gave its place to the review: Back does not come back to it.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/lichess\//);
});

test('game address - a Lichess game not on the device is fetched from Lichess', async ({
  page,
}) => {
  const asked = await sites(page);
  await page.goto(`/lichess/${lichessGame.id}`);
  await page.waitForURL(new RegExp(`/review/lichess%3A${lichessGame.id}$`));
  expect(asked).toHaveLength(1);
});

test('game address - a Chess.com game with the player in the address', async ({ page }) => {
  await sites(page);
  await page.goto('/chesscom/188816899405?username=hikaru');
  await page.waitForURL(/\/review\/chesscom%3A/);
});

test('game address - a Chess.com game with no player known goes on in Search', async ({ page }) => {
  const asked = await sites(page);
  await page.goto('/chesscom/daily/747757185');
  await page.waitForURL(/\/search$/);
  await expect(page.getByRole('searchbox')).toHaveValue(
    'https://www.chess.com/game/daily/747757185',
  );
  await expect(page.getByText('Type the username of either player.')).toBeVisible();
  expect(asked).toEqual([]);
});

test('game address - a Chess.com game not in the named player’s games', async ({ page }) => {
  await sites(page);
  await page.goto('/chesscom/999999999999?username=hikaru');
  await page.waitForURL(/\/search$/);
  await expect(page.getByText(/isn't in hikaru's games\./)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Chess.com username' })).toBeVisible();
});

test('game address - an address that is not a game goes Home', async ({ page }) => {
  await seed(page, '/');
  await page.goto('/chesscom/not-a-number');
  await expect(page).toHaveURL(/\/$/);
});
