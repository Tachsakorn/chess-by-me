import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * Something shared to the installed app on Android (1.2, Web Share Target): Android opens
 * /share?title=..&text=..&url=.. (public/manifest.webmanifest). Chess.com is answered from the
 * archive fixtures of src/data. That the shared text never reaches the server is tested on the
 * production build, with the service worker (e2e/prod/share.prod.spec.ts).
 */
const fixture = (name: string) =>
  readFileSync(new URL(`../src/data/__fixtures__/${name}`, import.meta.url), 'utf8');
const ARCHIVES = JSON.parse(fixture('chesscom-archives.json')) as { archives: string[] };
const PGN = readFileSync(new URL('../fixtures/lichess-HKl8S22m/game.pgn', import.meta.url), 'utf8');
const CORS = { 'Access-Control-Allow-Origin': '*' };

async function chessCom(page: Page) {
  await page.route('https://api.chess.com/**', (route) => {
    const url = route.request().url();
    if (url.endsWith('/hikaru/games/archives'))
      return route.fulfill({ json: ARCHIVES, headers: CORS });
    if (url === ARCHIVES.archives.at(-1))
      return route.fulfill({ body: fixture('chesscom-month.json'), headers: CORS });
    throw new Error(`unexpected request ${url}`);
  });
}
const share = (params: Record<string, string>) => `/share?${new URLSearchParams(params)}`;

test('share - the Chess.com app’s text with a link opens the game', async ({ page }) => {
  await chessCom(page);
  await page.goto(
    share({
      text: 'Check out this #chess game: https://www.chess.com/game/live/188816899405?username=hikaru',
    }),
  );
  await page.waitForURL(/\/review\/chesscom%3A/);
});

test('share - a Lichess link as the url opens the game on the device', async ({ page }) => {
  await seed(page, '/');
  await page.goto(share({ title: 'Lichess', url: 'https://lichess.org/LAGvRNey' }));
  await page.waitForURL(/\/review\/lichess%3ALAGvRNey$/);
});

test('share - a shared PGN is read on the device', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) outside.push(r.url());
  });
  await page.goto(share({ text: PGN }));
  await page.waitForURL(/\/review\//);
  expect(outside).toEqual([]);
});

test('share - text with no game says so and leaves the address clean', async ({ page }) => {
  await page.goto(share({ text: 'see you tomorrow' }));
  await expect(page.getByRole('heading', { name: "That isn't a game" })).toBeVisible();
  await expect(page).toHaveURL(/\/share$/);
  await page.getByRole('button', { name: 'Go to Search' }).click();
  await expect(page).toHaveURL(/\/search$/);
});
