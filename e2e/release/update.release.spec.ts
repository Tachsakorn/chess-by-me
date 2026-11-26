import type { ChildProcess } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import {
  analyse,
  controlled,
  GAMES,
  newProfile,
  openBrowser,
  reviewAddress,
  waitAnalysis,
  watchErrors,
} from './lib';
import { currentBuild, previousRelease, serve, stop, switchboard } from './servers';

/**
 * Release test 3 (Fable review 1.1 area 8): the previous release and this build behind one
 * address; the switch between them is the deploy. Covers a user of the previous release who opens
 * the new one, a tab left open across the switch, and offline after the update. The previous
 * release is PREVIOUS_RELEASE (default v1.1.0), built once into .release-cache/.
 */
const PREVIOUS = process.env.PREVIOUS_RELEASE ?? 'v1.1.0';
const OLD_PORT = 5331;
const NEW_PORT = 5332;
const BASE = 'http://127.0.0.1:5330';

let servers: ChildProcess[] = [];
let front: Awaited<ReturnType<typeof switchboard>>;

test.beforeAll(async () => {
  test.setTimeout(900_000);
  const old = previousRelease(PREVIOUS);
  const now = currentBuild();
  servers = [await serve('previous', old, OLD_PORT), await serve('current', now, NEW_PORT)];
  front = await switchboard(5330, OLD_PORT);
});

test.afterAll(() => {
  front?.close();
  servers.forEach(stop);
});

const entry = (page: Page) =>
  page.evaluate(() => document.querySelector('script[type="module"][src]')?.getAttribute('src'));

test(`update - a user of ${PREVIOUS} opens the new version, then goes offline`, async () => {
  front.to(OLD_PORT);
  const profile = newProfile('update');
  let browser = await openBrowser(profile);
  let page = browser.pages()[0] ?? (await browser.newPage());
  await page.goto(`${BASE}/`);
  await controlled(page);
  const oldEntry = await entry(page);
  expect(await analyse(page, BASE, GAMES[0])).toBe('done');
  const saved = reviewAddress(page);
  await browser.close();

  // The deploy, while the app is closed.
  front.to(NEW_PORT);
  browser = await openBrowser(profile);
  const errors = watchErrors(browser);
  page = browser.pages()[0] ?? (await browser.newPage());
  await page.goto(`${BASE}/`);
  await expect(page.locator('h1').first()).toBeVisible();
  expect(await entry(page)).not.toBe(oldEntry);
  // The saved review opens; a new game is analysed (at the latest on a second try: the first
  // page after a deploy may still run under the previous service worker, Fable review 1.1 B1-03).
  await page.goto(`${BASE}${saved}`);
  expect(await waitAnalysis(page)).toBe('done');
  let result = await analyse(page, BASE, GAMES[1]);
  if (result === 'failed') {
    await page.locator('#review-panel').getByRole('button').first().click();
    result = await waitAnalysis(page);
  }
  expect(result).toBe('done');
  await controlled(page);
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);

  // Offline after the update: the app opens, the saved review opens.
  await browser.setOffline(true);
  await page.goto(`${BASE}/`);
  await expect(page.locator('h1').first()).toBeVisible();
  await page.goto(`${BASE}${saved}`);
  expect(await waitAnalysis(page)).toBe('done');
  await browser.close();
});

test(`update - a tab of ${PREVIOUS} left open across the deploy can still analyse`, async () => {
  front.to(OLD_PORT);
  const browser = await openBrowser(newProfile('open-tab'));
  const old = browser.pages()[0] ?? (await browser.newPage());
  await old.goto(`${BASE}/`);
  await controlled(old);
  const oldEntry = await entry(old);

  // The deploy; another tab brings the new service worker, which takes over both tabs.
  front.to(NEW_PORT);
  const other = await browser.newPage();
  await other.goto(`${BASE}/settings`);
  await controlled(other);
  await expect
    .poll(
      async () =>
        (await other.evaluate(() => caches.keys())).filter((n) => n.startsWith('chessbyme-app-'))
          .length,
      {
        timeout: 30_000,
      },
    )
    .toBe(1);

  // Back in the old tab (or the page it reloaded into, if it was idle): an analysis works.
  await old.bringToFront();
  await old.waitForTimeout(2_000);
  const result = await analyse(old, BASE, GAMES[2]);
  if (result === 'failed') {
    // Only acceptable with the line that says a new version is ready (B1-02).
    await expect(old.getByText(/A new version is ready/)).toBeVisible();
  } else {
    expect(result).toBe('done');
  }
  void oldEntry;
  await browser.close();
});
