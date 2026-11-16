import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { seed } from './support';

/**
 * My Games › Others (Fable review A6-06, owner 2026-11-15): games opened from Search, a game link
 * or pasted PGN can be found again; a PGN with several games says that only the first opens.
 */
const pgn = (id: string) =>
  readFileSync(new URL(`../fixtures/${id}/game.pgn`, import.meta.url), 'utf8');

test('others - empty until a game is opened from elsewhere', async ({ page }) => {
  await seed(page, '/games');
  // By keyboard: End moves to the last tab, and focus goes with it.
  await page.getByRole('tab', { name: 'All' }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Others' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Others' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('No other games yet')).toBeVisible();
  await expect(
    page.getByText('Games you open from Search, a game link or a pasted PGN show up here.'),
  ).toBeVisible();
});

test('others - a pasted PGN with two games says the first opens, and is found again', async ({
  page,
}) => {
  await seed(page, '/search');
  await page.getByRole('button', { name: /Paste PGN/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('textbox').fill(`${pgn('lichess-HKl8S22m')}\n\n${pgn('lichess-f6WkG3uO')}`);
  await expect(sheet.getByRole('status')).toHaveText(
    'This PGN has 2 games. The first one will open (ni5hu – raphapap).',
  );

  // One game alone: no note.
  await sheet.getByRole('textbox').fill(pgn('lichess-HKl8S22m'));
  await expect(sheet.getByRole('status')).toHaveCount(0);

  await sheet.getByRole('textbox').fill(`${pgn('lichess-HKl8S22m')}\n\n${pgn('lichess-f6WkG3uO')}`);
  await sheet.getByRole('button', { name: 'Review' }).click();
  await page.waitForURL(/\/review\//);
  const opened = decodeURIComponent(new URL(page.url()).pathname.split('/').pop() ?? '');
  expect(opened.startsWith('pgn:')).toBe(true);

  await page.goto('/games');
  // The account's games stay under All; the pasted game is under Others only.
  await expect(page.getByText('ni5hu – raphapap')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Others' }).click();
  await expect(page.getByRole('tab', { name: 'Others' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Recently opened' })).toBeVisible();
  const row = page.getByRole('link', { name: /ni5hu – raphapap/ });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Pasted PGN');
  await row.click();
  await page.waitForURL((url) => decodeURIComponent(url.pathname).endsWith(opened));
});
