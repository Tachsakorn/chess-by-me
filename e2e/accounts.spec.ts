import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * Account data stays deleted (1.1.1, Fable review 1.1 B4-01, B4-02): an update from the site or
 * an analysis that is still running when the user disconnects or clears everything must not
 * write that account's data back, and typing another username deletes the first one's data.
 * Lichess is answered here, slowly, so the user can act while its answer is on its way.
 */
const fixturePgn = JSON.parse(
  readFileSync(new URL('../fixtures/lichess-LAGvRNey/game.json', import.meta.url), 'utf8'),
).pgn as string;
const CORS = { 'access-control-allow-origin': '*' };

async function slowLichess(page: Page, ms: number): Promise<void> {
  await page.route('https://lichess.org/api/games/user/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    const line = {
      id: 'LateGame1',
      createdAt: Date.now(),
      variant: 'standard',
      rated: true,
      status: 'mate',
      pgn: fixturePgn,
    };
    await route
      .fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'application/x-ndjson' },
        body: `${JSON.stringify(line)}\n`,
      })
      .catch(() => {});
  });
  await page.route('https://lichess.org/api/user/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    await route
      .fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify({
          id: name.toLowerCase(),
          username: name,
          perfs: { blitz: { rating: 1500, games: 10, prog: 3 } },
        }),
      })
      .catch(() => {});
  });
}

interface Stored {
  owners: Record<string, number>;
  analyses: number;
  kv: string[];
}
function stored(page: Page): Promise<Stored> {
  return page.evaluate(
    () =>
      new Promise<Stored>((resolve) => {
        const open = indexedDB.open('chessbyme');
        open.onsuccess = () => {
          const tx = open.result.transaction(['games', 'analyses', 'kv']);
          const games = tx.objectStore('games').getAll();
          const analyses = tx.objectStore('analyses').count();
          const kv = tx.objectStore('kv').getAllKeys();
          tx.oncomplete = () => {
            open.result.close();
            const owners: Record<string, number> = {};
            for (const row of games.result as { owner: string }[])
              owners[row.owner] = (owners[row.owner] ?? 0) + 1;
            resolve({
              owners,
              analyses: analyses.result,
              kv: (kv.result as string[]).filter((k) => k.startsWith('ratings:')),
            });
          };
        };
      }),
  );
}

/** Home › the avatar (Settings) › the Lichess row, by taps, so nothing running is stopped. */
async function openLichessAccount(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Account' }).click();
  await page.getByRole('link', { name: /Lichess/ }).click();
  await page.waitForURL(/\/connect/);
}

test('accounts - Disconnect during an update from Lichess deletes everything for good', async ({
  page,
}) => {
  await slowLichess(page, 6_000);
  await seed(page, '/');
  await openLichessAccount(page);
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('button', { name: 'Disconnect and delete' }).click();
  await page.waitForURL(/\/connect$/);
  // Lichess answers after the account is gone.
  // Games, then ratings (one request at a time per site), both answered after this.
  await page.waitForTimeout(15_000);
  expect(await stored(page)).toEqual({ owners: {}, analyses: 0, kv: [] });
});

test('accounts - Clear saved data while a game is analysed deletes everything for good', async ({
  page,
}) => {
  await slowLichess(page, 4_000);
  await seed(page, '/', '');
  // A game is opened: its analysis starts; the user goes on to Settings › Privacy at once.
  await page
    .getByRole('link', { name: /Continue|Not analyzed|ni5hu/ })
    .first()
    .click();
  await page.waitForURL(/\/review\//);
  await expect(page.getByText(/Analyzing|Downloading|Loading the engine/).first()).toBeVisible();
  await page.goBack();
  await page.getByRole('link', { name: 'Account' }).click();
  await page.getByRole('link', { name: 'Privacy' }).click();
  await page.getByRole('button', { name: 'Clear saved data' }).click();
  await page.getByRole('button', { name: 'Clear everything' }).click();
  await page.waitForURL(/\/connect$/);
  // Long enough for the analysis (and the slow update) to have finished.
  await page.waitForTimeout(25_000);
  expect(await stored(page)).toEqual({ owners: {}, analyses: 0, kv: [] });
});

test("accounts - another username asks first, then deletes the first account's data", async ({
  page,
}) => {
  await slowLichess(page, 0);
  await seed(page, '/');
  await expect
    .poll(async () => (await stored(page)).owners['lichess:ni5hu'] ?? 0)
    .toBeGreaterThan(0);
  await openLichessAccount(page);
  await page.getByRole('textbox').fill('OtherPlayer');
  await page.getByRole('button', { name: 'Continue' }).click();
  // The same question as Disconnect, naming the account whose data goes.
  const sheet = page.getByRole('alertdialog');
  await expect(sheet).toContainText('ni5hu');
  await sheet.getByRole('button', { name: 'Disconnect and delete' }).click();
  await page.waitForURL(/\/settings$/);
  await expect.poll(async () => (await stored(page)).owners['lichess:ni5hu'] ?? 0).toBe(0);
  expect((await stored(page)).kv).not.toContain('ratings:lichess:ni5hu');
});
