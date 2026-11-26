import { expect, test } from '@playwright/test';
import { analyse, controlled, GAMES, newProfile, openBrowser, watchErrors } from './lib';

/**
 * Release test 2 (Fable review 1.1 area 8): the same person comes back. One browser profile, the
 * service worker in control: a first analysis, a second after reloading, a third after the
 * browser is closed and opened again. The 1.0.x bug (every analysis after the first visit
 * failed) lived exactly here.
 */
test('release - second and third visit, and a browser restart, in one profile', async ({
  baseURL,
}) => {
  const profile = newProfile('visits');
  let browser = await openBrowser(profile);
  let errors = watchErrors(browser);
  let page = browser.pages()[0] ?? (await browser.newPage());
  await page.goto(`${baseURL}/`);
  await controlled(page);
  expect(await analyse(page, baseURL!, GAMES[0])).toBe('done');

  await page.reload();
  expect(await analyse(page, baseURL!, GAMES[1])).toBe('done');
  expect(errors).toEqual([]);
  await browser.close();

  browser = await openBrowser(profile);
  errors = watchErrors(browser);
  page = browser.pages()[0] ?? (await browser.newPage());
  await page.goto(`${baseURL}/`);
  await controlled(page);
  expect(await analyse(page, baseURL!, GAMES[2])).toBe('done');
  // The engine came from the device this time.
  const engines = await page.evaluate(async () =>
    (await caches.keys()).filter((name) => name.startsWith('chessbyme-engine-')),
  );
  expect(engines).toHaveLength(1);
  expect(errors).toEqual([]);
  await browser.close();
});
