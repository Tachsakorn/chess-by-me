import { expect, test } from '@playwright/test';
import {
  analyse,
  controlled,
  GAMES,
  newProfile,
  openBrowser,
  reviewAddress,
  tryAMove,
  waitAnalysis,
} from './lib';

/**
 * Release test 4 (Fable review 1.1 area 8): offline use, a stated feature. After one analysis
 * online the network goes: the app opens again, the saved review opens, a move can be tried, and
 * a new game can be analysed (engine and opening book are on the device).
 */
test('release - offline after one analysis online', async ({ baseURL }) => {
  const browser = await openBrowser(newProfile('offline'));
  const page = browser.pages()[0] ?? (await browser.newPage());
  await page.goto(`${baseURL}/`);
  await controlled(page);
  expect(await analyse(page, baseURL!, GAMES[0])).toBe('done');
  const saved = reviewAddress(page);

  await browser.setOffline(true);
  await page.reload();
  await expect(page.locator('h1, #review-panel').first()).toBeVisible();
  await page.goto(`${baseURL}${saved}`);
  expect(await waitAnalysis(page)).toBe('done');
  await tryAMove(page);
  expect(await analyse(page, baseURL!, GAMES[1])).toBe('done');
  await browser.close();
});
