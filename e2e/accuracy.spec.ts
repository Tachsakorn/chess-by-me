import { expect, test } from '@playwright/test';
import { seed } from './support';

type Local = typeof import('../src/data/local');
type Pgn = typeof import('../src/data/pgn');
/** Variables, so TypeScript leaves the paths alone: they are the dev server's, read in the page. */
const LOCAL_PATH = '/src/data/local.ts';
const PGN_PATH = '/src/data/pgn.ts';

/**
 * A side that made no move has no accuracy to show (Fable review A1-07, owner 1.1 round 2): a
 * dash on the review screen, in My Games and on Home's Continue card; the side that moved keeps
 * its number.
 */
test('accuracy - a dash for the side that made no move, on the review screen and in My Games › Others', async ({
  page,
}) => {
  await seed(page, '/search');
  await page.getByRole('button', { name: /Paste PGN/ }).click();
  const sheet = page.getByRole('dialog');
  // White moved once and Black resigned without a move.
  await sheet
    .getByRole('textbox')
    .fill('[White "Mover"]\n[Black "Resigner"]\n[Result "1-0"]\n\n1. e4 1-0');
  await sheet.getByRole('button', { name: 'Review' }).click();
  await page.waitForURL(/\/review\//);

  // Review screen, Summary tab.
  await page.getByRole('tab', { name: 'Summary' }).click();
  const white = page.getByText('Mover accuracy').locator('xpath=following-sibling::p[1]');
  const black = page.getByText('Resigner accuracy').locator('xpath=following-sibling::p[1]');
  await expect(white).toHaveText(/^\d+\.\d$/, { timeout: 60_000 });
  await expect(black).toHaveText('—');

  // My Games › Others: both accuracies of a game of other players.
  await page.goto('/games');
  await page.getByRole('tab', { name: 'Others' }).click();
  await expect(page.getByRole('link', { name: /Mover – Resigner/ })).toBeVisible();
  await expect(page.getByText(/^\d+\.\d · —$/)).toBeVisible();
});

test("accuracy - a dash on Home's Continue card and in the account's games", async ({ page }) => {
  // The account ni5hu with one game only: ni5hu (Black) resigned before making a move.
  // Seeded, then a development page that does not run the app, so nothing navigates meanwhile.
  await page.goto(`/dev/seed/?empty=1&go=${encodeURIComponent('/dev/badges/')}`);
  await page.waitForURL('**/dev/badges/');
  const id = await page.evaluate(
    async (paths) => {
      const { local, ownerKey } = (await import(paths.local)) as Local;
      const { gameFromPgn } = (await import(paths.pgn)) as Pgn;
      const game = gameFromPgn(
        '[White "Mover"]\n[Black "ni5hu"]\n[Result "1-0"]\n[UTCDate "2026.11.16"]\n[UTCTime "10:00:00"]\n\n1. e4 1-0',
        { source: 'lichess', id: 'lichess:noMoves01' },
      )!;
      await local.putGames([game], ownerKey('lichess', 'ni5hu'));
      return game.id;
    },
    { local: LOCAL_PATH, pgn: PGN_PATH },
  );

  // Analysed on opening: the dash is checked once White's number is there (a dash also shows
  // while the analysis runs).
  await page.goto(`/review/${encodeURIComponent(id)}`);
  await page.getByRole('tab', { name: 'Summary' }).click();
  const accuracyOf = (name: string) =>
    page.getByText(`${name} accuracy`).locator('xpath=following-sibling::p[1]');
  await expect(accuracyOf('Mover')).toHaveText(/^\d+\.\d$/, { timeout: 60_000 });
  await expect(accuracyOf('ni5hu')).toHaveText('—');

  // My Games: the user's own accuracy, which is the dash.
  await page.goto('/games');
  await expect(page.getByRole('link', { name: /Mover/ }).first()).toBeVisible();
  await expect(page.getByText('—', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Analyze/ })).toHaveCount(0);

  // Home: the Continue card, the newest analysed game.
  await page.goto('/');
  await expect(page.getByText(/^Accuracy \d+\.\d \/ —$/)).toBeVisible();
});
