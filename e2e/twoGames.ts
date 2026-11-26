import { expect, type Page } from '@playwright/test';

/**
 * Two games analysed one after the other in the same browser, the app loaded anew in between
 * (1.1.0 release, 2026-11-17): with the service worker in control, the second analysis failed at
 * once ("Analysis didn't finish") because the engine's worker script came from the service
 * worker's cache. Shared by the dev-server test (no service worker) and the production-build
 * tests (with and without the service worker).
 */
const GAMES = [
  '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *',
  '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O *',
];

/** Every text the review panel showed during the analysis (an observer in the page). */
async function analyse(page: Page, pgn: string): Promise<string[]> {
  await page.goto('/search');
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { panelTexts: string[] }).panelTexts = seen;
    new MutationObserver(() => {
      const text = document.getElementById('review-panel')?.textContent ?? '';
      if (text && seen.at(-1) !== text) seen.push(text);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.getByRole('button', { name: /Paste PGN/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('textbox').fill(pgn);
  await sheet.getByRole('button', { name: 'Review' }).click();
  await page.waitForURL(/\/review\//);
  const panel = page.locator('#review-panel');
  await expect(panel).toContainText(/Drag a piece to try your own move|Analysis didn.t finish/, {
    timeout: 120_000,
  });
  await expect(panel).toContainText('Drag a piece to try your own move');
  return page.evaluate(() => (window as unknown as { panelTexts: string[] }).panelTexts);
}

const said = (texts: string[], what: RegExp) => texts.some((text) => what.test(text));

export async function analyseTwoGames(page: Page, serviceWorker: boolean): Promise<void> {
  await page.goto('/');
  if (serviceWorker) {
    // Installed and in control of the page before the first game, as for anyone who has opened
    // the app before.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  }
  const first = await analyse(page, GAMES[0]!);
  // The first time the engine really is downloaded.
  expect(said(first, /Downloading the engine/)).toBe(true);
  expect(said(first, /Loading the engine/)).toBe(false);
  // The app is opened again: a new page, a new copy of the engine's WebAssembly.
  await page.reload();
  const second = await analyse(page, GAMES[1]!);
  // 1.1.1 (owner): from the service worker's storage it is "Loading", never "Downloading N%".
  // Without the service worker the file comes over the network again.
  expect(said(second, /Loading the engine/)).toBe(serviceWorker);
  expect(said(second, /Downloading the engine/)).toBe(!serviceWorker);
  if (serviceWorker) {
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      return names.some((name) => name.startsWith('chessbyme-engine-'));
    });
    expect(cached).toBe(true);
  }
}
