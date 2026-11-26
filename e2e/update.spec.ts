import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * A new version never reloads the page by itself while the person has text not sent yet (owner,
 * 1.1.1 round 2): the guard is checked here against the real fields of the real screens. The
 * reload itself is tested in src/ui/app/appUpdate.test.ts and with two production builds.
 */
const unsent = (page: Page) =>
  page.evaluate(async (module) => {
    const { hasUnsentText } = (await import(module)) as { hasUnsentText(): boolean };
    return hasUnsentText();
  }, '/src/ui/app/appUpdate.ts');

test('update - typed text holds back the automatic reload, on every text field', async ({
  page,
}) => {
  await seed(page, '/search');
  expect(await unsent(page)).toBe(false);

  // The search field: focused, then holding text.
  const search = page.getByRole('searchbox').or(page.getByRole('textbox')).first();
  await search.click();
  expect(await unsent(page)).toBe(true);
  await search.fill('someone');
  await page.locator('h1').first().click();
  expect(await unsent(page)).toBe(true);
  await search.fill('');
  await page.locator('h1').first().click();
  expect(await unsent(page)).toBe(false);

  // The PGN box.
  await page.getByRole('button', { name: /Paste PGN/ }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('1. e4 e5');
  expect(await unsent(page)).toBe(true);
  await page.keyboard.press('Escape');

  // The username field on Connect.
  await page.goto('/connect');
  await page.locator('h1').first().waitFor();
  expect(await unsent(page)).toBe(false);
  await page.getByRole('textbox').first().fill('ni5hu');
  await page.locator('h1').first().click();
  expect(await unsent(page)).toBe(true);
});
