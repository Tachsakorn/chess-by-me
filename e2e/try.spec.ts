import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * "Try your own move" on the review screen (owner, 2026-11-16): in an analysed game the side to
 * move can be dragged, or tapped and then a square tapped; another move than the game's starts a
 * line of the reader's own, which the real engine checks.
 *
 * The fixture game LAGvRNey, left at 8. h3 (ply 15): Black played 8... d5; the engine preferred
 * 8... Nh6. The user is Black, so Black is at the bottom of the board.
 */
const REVIEW = '/review/lichess%3ALAGvRNey';
const RESULT = 60_000;

/** The middle of a square on the screen, whichever way round the board is. */
async function spot(page: Page, square: string): Promise<{ x: number; y: number }> {
  return page.evaluate((name) => {
    const board = document.querySelector('cg-board')!;
    const box = board.getBoundingClientRect();
    const white = board.closest('.cg-wrap')!.classList.contains('orientation-white');
    const file = 'abcdefgh'.indexOf(name[0]!);
    const rank = Number(name[1]) - 1;
    const column = white ? file : 7 - file;
    const row = white ? 7 - rank : rank;
    return {
      x: box.left + ((column + 0.5) * box.width) / 8,
      y: box.top + ((row + 0.5) * box.height) / 8,
    };
  }, square);
}

async function drag(page: Page, from: string, to: string): Promise<void> {
  const start = await spot(page, from);
  const end = await spot(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
}

async function tap(page: Page, square: string): Promise<void> {
  const { x, y } = await spot(page, square);
  await page.mouse.click(x, y);
}

const panel = (page: Page) => page.locator('#review-panel');
const bar = (page: Page) => page.getByText('Your line · from move 8');
const backToGame = (page: Page) => page.getByRole('button', { name: 'Back to game' });
/** The quality badge on the board (not the grey one of a move being checked). */
const boardBadge = (page: Page) => page.locator('[class*="tone-"]');

async function open(page: Page): Promise<void> {
  await seed(page, REVIEW, 'LAGvRNey', 15);
  await expect(panel(page)).toContainText('8. h3');
}

test('try - dragging another move than the game move checks it and labels it', async ({ page }) => {
  await open(page);
  await drag(page, 'g4', 'h6');

  // The bar takes the place of the tabs; the graph fades.
  await expect(bar(page)).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.locator('[class*="graphFaded"]')).toHaveCount(1);

  // While the engine thinks.
  await expect(panel(page)).toContainText('8... Nh6');
  await expect(panel(page)).toContainText('Checking this move');
  await expect(panel(page)).toContainText('Game move was 8... d5');
  await expect(page.locator('[data-checking]')).toHaveCount(1);

  // The result: the engine's own first choice there, so Best (or one of its upgrades).
  await expect(boardBadge(page)).toHaveCount(1, { timeout: RESULT });
  await expect(page.locator('[data-checking]')).toHaveCount(0);
  await expect(panel(page)).toContainText(/8\.\.\. Nh6!{0,2}(Best|Great|Brilliant)/);
  await expect(panel(page)).toContainText('Better than the game move 8... d5');
  await expect(panel(page)).toContainText(/Best reply 9\. \S+/);
  // Read out to a screen reader.
  await expect(page.locator('[data-try-result]')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('[data-try-result]')).toContainText('Better than the game move');
});

test('try - Next plays the best reply, Previous steps back and then returns to the game', async ({
  page,
}) => {
  await open(page);
  await drag(page, 'g4', 'h6');
  await expect(panel(page)).toContainText('Best reply', { timeout: RESULT });

  const next = page.getByRole('button', { name: 'Next move' });
  await next.click();
  // White's reply, checked in its turn.
  await expect(panel(page).locator('.t-move-title')).toHaveText(/^9\. /);
  await expect(boardBadge(page)).toHaveCount(1, { timeout: RESULT });
  await expect(panel(page)).not.toContainText('game move');

  const previous = page.getByRole('button', { name: 'Previous move' });
  await previous.click();
  await expect(panel(page).locator('.t-move-title')).toHaveText(/^8\.\.\. Nh6/);
  await expect(bar(page)).toBeVisible();
  // The line is kept: Next goes to its move again, at once.
  await next.click();
  await expect(panel(page).locator('.t-move-title')).toHaveText(/^9\. /);
  await previous.click();
  await previous.click();
  // Past the first move of the line: the game, where it was left.
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(panel(page)).toContainText('8. h3');
});

test('try - Back to game and Escape return to the position the line left from', async ({
  page,
}) => {
  await open(page);
  await drag(page, 'g4', 'h6');
  await expect(bar(page)).toBeVisible();
  await backToGame(page).click();
  await expect(bar(page)).toHaveCount(0);
  await expect(panel(page)).toContainText('8. h3');
  await expect(page.locator('[class*="graphFaded"]')).toHaveCount(0);

  await drag(page, 'g4', 'f2');
  await expect(panel(page)).toContainText('8... Nxf2');
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
  await expect(panel(page)).toContainText('8. h3');

  // To the start and to the end of the game from a line.
  await drag(page, 'g4', 'h6');
  await expect(bar(page)).toBeVisible();
  await page.getByRole('button', { name: 'Go to end' }).click();
  await expect(bar(page)).toHaveCount(0);
  await expect(panel(page)).toContainText('43. Rh8#');
});

test('try - the arrow keys work in a line, and Back to game can be reached by keyboard', async ({
  page,
}) => {
  await open(page);
  await drag(page, 'g4', 'h6');
  await expect(panel(page)).toContainText('Best reply', { timeout: RESULT });
  await page.keyboard.press('ArrowRight');
  await expect(panel(page).locator('.t-move-title')).toHaveText(/^9\. /);
  await page.keyboard.press('ArrowLeft');
  await expect(panel(page).locator('.t-move-title')).toHaveText(/^8\.\.\. Nh6/);

  await backToGame(page).focus();
  await expect(backToGame(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(bar(page)).toHaveCount(0);

  await drag(page, 'g4', 'h6');
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(bar(page)).toHaveCount(0);
  await expect(panel(page)).toContainText('8. h3');
});

test('try - tapping a piece marks where it can go; the game move steps along the game', async ({
  page,
}) => {
  await open(page);
  await tap(page, 'g4');
  // The knight on g4: e3, e5 (a capture), f2 (a capture), f6, h2, h6.
  await expect(page.locator('cg-board square.move-dest:visible')).toHaveCount(6);
  await expect(page.locator('cg-board square.move-dest.oc:visible')).toHaveCount(2);
  // A square it cannot go to: nothing happens, no line.
  await tap(page, 'g8');
  await expect(bar(page)).toHaveCount(0);

  // 8... d5 is the move of the game: the next move of the game, not a line.
  await tap(page, 'd7');
  await tap(page, 'd5');
  await expect(panel(page)).toContainText('8... d5');
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(3);
});

test('try - a move that is not legal springs back, and the other side cannot be moved', async ({
  page,
}) => {
  await open(page);
  await drag(page, 'g4', 'g8');
  await drag(page, 'h3', 'g4'); // White's pawn, on Black's turn
  await expect(bar(page)).toHaveCount(0);
  await expect(panel(page)).toContainText('8. h3');
  const knight = await spot(page, 'g4');
  const pieces = await page.evaluate(
    ({ x, y }) =>
      [...document.querySelectorAll('cg-board piece')]
        .filter((piece) => {
          const box = piece.getBoundingClientRect();
          return x > box.left && x < box.right && y > box.top && y < box.bottom;
        })
        .map((piece) => piece.className),
    knight,
  );
  expect(pieces).toEqual(['black knight']);
});

test('try - nothing can be moved until the game is analysed', async ({ page }) => {
  await seed(page, '/games');
  await page.goto('/review/lichess%3Af6WkG3uO');
  await expect(panel(page)).toContainText(/Downloading the engine|Analyzing/);
  await drag(page, 'e2', 'e4');
  await tap(page, 'g1');
  await expect(page.locator('cg-board square.move-dest:visible')).toHaveCount(0);
  await expect(page.getByText(/Your line/)).toHaveCount(0);
  await expect(panel(page)).toContainText('Start of the game');
  await expect(panel(page)).not.toContainText('Drag a piece');
});

test('try - a pawn reaching the last row asks which piece it becomes', async ({ page }) => {
  await seed(page, '/search');
  await page.getByRole('button', { name: /Paste PGN/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('textbox').fill('1. h4 g5 2. hxg5 h6 3. gxh6 Nf6 4. h7 Rg8 *');
  await sheet.getByRole('button', { name: 'Review' }).click();
  await page.waitForURL(/\/review\//);
  // Analysed: the hint about trying a move is there.
  await expect(panel(page)).toContainText('Drag a piece to try your own move', {
    timeout: 120_000,
  });
  await page.keyboard.press('End');
  await expect(panel(page)).toContainText('4... Rg8');

  await drag(page, 'h7', 'h8');
  const picker = page.getByRole('dialog', { name: 'Choose a piece' });
  await expect(picker.getByRole('button')).toHaveCount(4);
  // Escape takes the move back and leaves no line.
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(page.getByText(/Your line/)).toHaveCount(0);

  await drag(page, 'h7', 'h8');
  await picker.getByRole('button', { name: 'Knight' }).click();
  await expect(page.getByText('Your line · from move 5')).toBeVisible();
  await expect(panel(page)).toContainText('5. h8=N');
  // The game has no move here: nothing to compare with.
  await expect(panel(page)).not.toContainText('Game move was');
  await expect(boardBadge(page)).toHaveCount(1, { timeout: RESULT });
});

/**
 * The cause of a flaky run of the test above (1.1 round 1): the board hands the move over a moment
 * after the pawn is put down (chessground calls back from a timer), and the piece list took the
 * keyboard only after the browser had painted it. Escape pressed in between went to the page,
 * which ignores it while no line is on the board, and the list stayed open. The same happened for
 * good once the keyboard was elsewhere, for instance after a click beside the board.
 */
test('try - Escape closes the piece list at once, and after a click beside the board', async ({
  page,
}) => {
  await seed(page, '/search');
  await page.getByRole('button', { name: /Paste PGN/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('textbox').fill('1. h4 g5 2. hxg5 h6 3. gxh6 Nf6 4. h7 Rg8 *');
  await sheet.getByRole('button', { name: 'Review' }).click();
  await page.waitForURL(/\/review\//);
  await expect(panel(page)).toContainText('Drag a piece to try your own move', {
    timeout: 120_000,
  });
  await page.keyboard.press('End');
  await expect(panel(page)).toContainText('4... Rg8');
  const picker = page.getByRole('dialog', { name: 'Choose a piece' });

  // Escape at the very moment the list appears, before the browser paints it.
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('[role="dialog"]')) return;
      observer.disconnect();
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await drag(page, 'h7', 'h8');
  await expect(picker).toHaveCount(0);
  await expect(page.getByText(/Your line/)).toHaveCount(0);

  // The keyboard moved away from the list by a click beside the board: Escape still closes it.
  await drag(page, 'h7', 'h8');
  await expect(picker.getByRole('button')).toHaveCount(4);
  await page
    .locator('h1, header')
    .first()
    .click({ position: { x: 2, y: 2 }, force: true });
  await expect(picker).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(page.getByText(/Your line/)).toHaveCount(0);

  // And a piece can still be chosen afterwards.
  await drag(page, 'h7', 'h8');
  await picker.getByRole('button', { name: 'Queen' }).click();
  await expect(panel(page)).toContainText('5. h8=Q');
});
