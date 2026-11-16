import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * Move sounds on the review screen (owner, 2026-11-16). The app fires a `cbm-sound` event on
 * window for every sound it plays (src/ui/sound/player.ts); the tests collect them. Whether the
 * sound is heard is not tested here (the owner listened on an iPad).
 *
 * LAGvRNey: 3. d4 is ply 5, 3... exd4 (a capture) ply 6; 8. h3 is ply 15, Black to move.
 */
const REVIEW = '/review/lichess%3ALAGvRNey';
const RESULT = 60_000;

async function listen(page: Page) {
  await page.addInitScript(() => {
    const sounds: string[] = [];
    (window as unknown as { sounds: string[] }).sounds = sounds;
    window.addEventListener('cbm-sound', (event) => sounds.push((event as CustomEvent).detail));
  });
}
const sounds = (page: Page) =>
  page.evaluate(() => [...(window as unknown as { sounds: string[] }).sounds]);

const panel = (page: Page) => page.locator('#review-panel');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function open(page: Page, ply: number) {
  await listen(page);
  await seed(page, REVIEW, 'LAGvRNey', ply);
  await expect(panel(page)).toBeVisible();
}

test('sound - one step at a time sounds the move, by button and by arrow key', async ({ page }) => {
  await open(page, 5);
  await expect(panel(page)).toContainText('3. d4');

  await button(page, 'Next move').click(); // 3... exd4
  await expect(panel(page)).toContainText('3... exd4');
  await button(page, 'Next move').click(); // 4. Bc4
  await button(page, 'Previous move').click(); // takes back 4. Bc4
  await button(page, 'Previous move').click(); // takes back 3... exd4
  await page.keyboard.press('ArrowRight'); // 3... exd4
  await expect.poll(() => sounds(page)).toEqual(['capture', 'move', 'move', 'capture', 'capture']);
});

test('sound - the end of the game and a check', async ({ page }) => {
  await open(page, 76);
  await page.keyboard.press('ArrowRight'); // 39. Rag7+
  await expect(panel(page)).toContainText('Rag7+');
  await page.getByRole('button', { name: 'Go to end' }).click();
  await page.keyboard.press('ArrowLeft'); // takes back 43. Rh8#
  await page.keyboard.press('ArrowRight'); // 43. Rh8#: the game ends
  await expect.poll(() => sounds(page)).toEqual(['check', 'end', 'end']);
});

test('sound - silent for a jump, a tap on the graph and a held step button', async ({ page }) => {
  await open(page, 30);
  await page.getByRole('button', { name: 'Go to start' }).click();
  await page.getByRole('button', { name: 'Go to end' }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('End');
  const graph = page.getByRole('img', { name: /Evaluation across the game/ });
  await graph.click({ position: { x: 60, y: 20 } });
  await graph.click({ position: { x: 200, y: 20 } });
  await page.waitForTimeout(300);
  expect(await sounds(page)).toEqual([]);

  // Held down: the first step is the tap and sounds; the steps that repeat do not.
  await page.keyboard.press('Home');
  const next = await button(page, 'Next move').boundingBox();
  await page.mouse.move(next!.x + next!.width / 2, next!.y + next!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1_100);
  await page.mouse.up();
  const ply = Number(
    await panel(page)
      .locator('.t-move-title')
      .textContent()
      .then((t) => t?.match(/^(\d+)/)?.[1]),
  );
  expect(ply).toBeGreaterThanOrEqual(2); // move 2 or later: it stepped several times
  expect(await sounds(page)).toEqual(['move']); // 1. e4, once
});

test('sound - a move tried on the board and the engine reply', async ({ page }) => {
  await open(page, 15);
  await expect(panel(page)).toContainText('8. h3');
  const board = await page.locator('cg-board').boundingBox();
  // Black at the bottom: g4 is column 2 from the left, row 4 from the top; h6 column 1, row 6.
  const at = (column: number, row: number) => ({
    x: board!.x + ((column - 0.5) * board!.width) / 8,
    y: board!.y + ((row - 0.5) * board!.height) / 8,
  });
  const from = at(2, 4);
  const to = at(1, 6);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect(panel(page)).toContainText('8... Nh6');
  await expect.poll(() => sounds(page)).toEqual(['move']);

  await expect(panel(page)).toContainText('Best reply', { timeout: RESULT });
  await button(page, 'Next move').click(); // the engine's reply
  await expect(panel(page).locator('.t-move-title')).toHaveText(/^9\. /);
  await expect.poll(() => sounds(page)).toHaveLength(2);
  expect((await sounds(page))[1]).toMatch(/^(move|capture|check|end)$/);
});

/** Moves to another screen inside the app, without loading the page again. */
async function goInApp(page: Page, path: string) {
  await page.evaluate((to) => {
    history.pushState(null, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

test('sound - the Settings switch is on at first, and off means silent', async ({ page }) => {
  await open(page, 5);
  await page.keyboard.press('ArrowRight'); // sound is set up and plays
  await expect.poll(() => sounds(page)).toEqual(['capture']);

  // Turned off without leaving the page: the sound already set up must stop too.
  await goInApp(page, '/settings');
  const toggle = page.getByRole('switch', { name: 'Sound' });
  await expect(toggle).toBeChecked();
  await page.getByText('Sound', { exact: true }).click(); // the whole row flips it
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('cbm.sound'))).toBe('off');
  await page.goBack();
  await expect(panel(page)).toBeVisible();
  await button(page, 'Next move').click();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);
  expect(await sounds(page)).toEqual(['capture']);

  // Still off after the page is loaded again.
  await page.reload();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  expect(await sounds(page)).toEqual([]);

  // On again: sound again.
  await goInApp(page, '/settings');
  await page.getByRole('switch', { name: 'Sound' }).check();
  await page.goBack();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => sounds(page)).toHaveLength(1);
});
