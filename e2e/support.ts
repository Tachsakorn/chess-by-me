import type { Page } from '@playwright/test';

/**
 * Fills the app's storage with the fixtures as the Lichess account of the fixture games
 * (dev/seed), with the analyses of `analyzed` saved, then opens `go`. `paused` is the move the
 * user left LAGvRNey at (16 unless given).
 */
export async function seed(
  page: Page,
  go: string,
  analyzed = 'LAGvRNey',
  paused?: number,
): Promise<void> {
  const left = paused === undefined ? '' : `&paused=${paused}`;
  await page.goto(`/dev/seed/?analyzed=${analyzed}${left}&go=${encodeURIComponent(go)}`);
  await page.waitForURL((url) => !url.pathname.startsWith('/dev/'));
  await page.locator('h1').first().waitFor();
}

/** Collects the requests the page sends to any site other than the app's own. */
export function outsideRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://localhost:5317')) seen.push(request.url());
  });
  return seen;
}

/** How many analyses of `gameId` are saved on the device. */
export function savedAnalyses(page: Page, gameId: string): Promise<number> {
  return page.evaluate(
    (id) =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('chessbyme');
        open.onsuccess = () => {
          const count = open.result.transaction('analyses').objectStore('analyses').count(id);
          count.onsuccess = () => resolve(count.result);
        };
      }),
    gameId,
  );
}
