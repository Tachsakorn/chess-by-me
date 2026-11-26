import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * Impossible PGN dates (1.1.1, Fable review 1.1 B4-04). `[Date "2024.00.00"]` (day unknown in old
 * collections) was stored as `2024-00-00T00:00:00Z`, and My Games › Others then showed
 * "Something went wrong" every time. Now such a date is stored as no date, and a bad date already
 * stored by 1.1.0 is read as none and repaired.
 */
const MOVES = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *';
const pasted = (date: string, white: string) =>
  `[Event "Club"]\n[Date "${date}"]\n[White "${white}"]\n[Black "Black One"]\n[Result "*"]\n\n${MOVES}\n`;

/** The playedAt of every stored game opened from elsewhere, by White's name. */
function storedDates(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, string | null>>((resolve) => {
        const open = indexedDB.open('chessbyme');
        open.onsuccess = () => {
          const all = open.result.transaction('games').objectStore('games').getAll();
          all.onsuccess = () => {
            open.result.close();
            const rows = all.result as {
              owner: string;
              playedAt: string | null;
              game: { playedAt: string | null; white: { name: string } };
            }[];
            resolve(
              Object.fromEntries(
                rows
                  .filter((row) => row.owner === 'other')
                  .map((row) => [row.game.white.name, row.game.playedAt ?? row.playedAt]),
              ),
            );
          };
        };
      }),
  );
}

async function paste(page: Page, text: string): Promise<void> {
  await page.goto('/search');
  await page.getByRole('button', { name: /Paste PGN/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('textbox').fill(text);
  await sheet.getByRole('button', { name: 'Review' }).click();
  await page.waitForURL(/\/review\//);
  await expect(page.getByText('Start of the game')).toBeVisible();
}

test('dates - a pasted game dated 2024.00.00 is kept without a date; Others still opens', async ({
  page,
}) => {
  await seed(page, '/search');
  await paste(page, pasted('2024.00.00', 'Unknown Day'));
  await paste(page, pasted('2024.13.40', 'Thirteenth Month'));
  expect(await storedDates(page)).toEqual({ 'Unknown Day': null, 'Thirteenth Month': null });

  await page.goto('/games');
  await page.getByRole('tab', { name: 'Others' }).click();
  await expect(page.getByRole('link', { name: /Unknown Day/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Thirteenth Month/ })).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
});

test('dates - a bad date stored by 1.1.0 is read as none, repaired, and can be cleared', async ({
  page,
}) => {
  await seed(page, '/search');
  await paste(page, pasted('2024.05.01', 'Stored Badly'));
  // What 1.1.0 left on the device for such a game.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('chessbyme');
        open.onsuccess = () => {
          const tx = open.result.transaction(['games', 'kv'], 'readwrite');
          const store = tx.objectStore('games');
          const all = store.getAll();
          all.onsuccess = () => {
            for (const row of all.result as {
              owner: string;
              game: { playedAt: string | null };
            }[]) {
              if (row.owner !== 'other') continue;
              const bad = '2024-00-00T00:00:00Z';
              store.put({ ...row, playedAt: bad, game: { ...row.game, playedAt: bad } });
            }
            tx.objectStore('kv').delete('repaired:dates');
          };
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
        };
      }),
  );
  expect(await storedDates(page)).toEqual({ 'Stored Badly': '2024-00-00T00:00:00Z' });

  await page.goto('/games');
  await page.getByRole('tab', { name: 'Others' }).click();
  await expect(page.getByRole('link', { name: /Stored Badly/ })).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await expect.poll(() => storedDates(page)).toEqual({ 'Stored Badly': null });

  // The game can be deleted from the device with the rest ("Clear saved data").
  await page.goto('/settings/privacy');
  await page.getByRole('button', { name: 'Clear saved data' }).click();
  await page.getByRole('button', { name: 'Clear everything' }).click();
  await expect.poll(() => storedDates(page)).toEqual({});
});
