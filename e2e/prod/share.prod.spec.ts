import { expect, test } from '@playwright/test';

/**
 * A share to the installed app (1.2, Web Share Target) on the production build: with the service
 * worker in control, /share?text=... is answered from the stored app and never sent to the
 * server. The same check on an ordinary address shows the method sees a request that does leave.
 */
test.use({ serviceWorkers: 'allow' });

test('share - the shared text does not leave the device once the app is installed', async ({
  page,
  context,
}) => {
  const fromWorker: string[] = [];
  context.on('request', (request) => {
    if (request.serviceWorker()) fromWorker.push(request.url());
  });
  await page.goto('/');
  await expect
    .poll(async () => {
      await page.reload();
      return page.evaluate(() => navigator.serviceWorker.controller !== null);
    })
    .toBe(true);

  // An ordinary address goes to the network first (network-first pages): the method sees it.
  await page.goto('/settings?probe=ORDINARY');
  await expect.poll(() => fromWorker.some((url) => url.includes('ORDINARY'))).toBe(true);

  const shared = await page.goto('/share?text=SHARED-SECRET-TEXT');
  expect(shared?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('heading', { name: "That isn't a game" })).toBeVisible();
  expect(fromWorker.filter((url) => url.includes('SHARED-SECRET'))).toEqual([]);
  await expect(page).toHaveURL(/\/share$/);
});
