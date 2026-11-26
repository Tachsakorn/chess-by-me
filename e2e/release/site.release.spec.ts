import { expect, test } from '@playwright/test';
import { analyse, GAMES, tryAMove, watchErrors } from './lib';

/**
 * Release test 1 (Fable review 1.1 area 8): the production build as the site serves it. The real
 * headers are there; a missing script is never answered with the page and a year's cache (B1-01);
 * a full flow (paste, analyse, try a move, Settings, Privacy) gives no console error and no CSP
 * report.
 */
test('release - the headers of the site, and a missing script is a 404 never kept', async ({
  request,
}) => {
  const page = await request.get('/');
  expect(page.status()).toBe(200);
  const headers = page.headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['strict-transport-security']).toBe('max-age=15552000');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['cache-control']).toBe('no-cache, no-transform');
  expect(headers['x-robots-tag']).toBeUndefined();

  for (const path of ['/assets/does-not-exist.js', '/engines/stockfish-17.1-single-0000000.wasm']) {
    const missing = await request.get(path);
    expect(missing.status(), path).toBe(404);
    expect(missing.headers()['content-type'], path).not.toContain('text/html');
    expect(missing.headers()['cache-control'], path).toBe('no-store');
  }
  const app = await request.get('/review/lichess%3AabcDEF12');
  expect(app.status()).toBe(200);
  expect(app.headers()['content-type']).toContain('text/html');
});

test('release - a full flow with no console error and no CSP report', async ({
  page,
  context,
  baseURL,
}) => {
  const errors = watchErrors(context);
  await page.goto('/');
  expect(await analyse(page, baseURL!, GAMES[0])).toBe('done');
  await tryAMove(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('button', { name: 'Clear saved data' })).toBeVisible();
  expect(errors).toEqual([]);
});
