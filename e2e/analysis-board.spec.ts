import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * The analysis board (owner, 2026-11-26): reached from Search, moves by tap or drag, the real
 * engine's lines and the review's labels, the moves in the address, its settings kept on the
 * device. Nothing is seeded: the board needs no account and no saved game.
 */
const RESULT = 60_000;

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

async function tap(page: Page, from: string, to: string): Promise<void> {
  for (const square of [from, to]) {
    const { x, y } = await spot(page, square);
    await page.mouse.click(x, y);
  }
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

const panel = (page: Page) => page.locator('#analysis-panel');
const movesInAddress = (page: Page) => new URL(page.url()).searchParams.get('moves');

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('analysis board - from Search, moves by tap and drag, labels, lines and the address', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/search');
  await page.getByRole('button', { name: /Analysis board/ }).click();
  await expect(page).toHaveURL(/\/analysis$/);
  await expect(page.getByRole('heading', { name: 'Analysis' })).toBeVisible();
  await expect(panel(page)).toContainText('The starting position');

  await tap(page, 'e2', 'e4');
  await expect.poll(() => movesInAddress(page)).toBe('e2e4');
  await drag(page, 'e7', 'e5');
  await expect.poll(() => movesInAddress(page)).toBe('e2e4,e7e5');
  // The review's own label, from the same search as the game analysis.
  await expect(panel(page)).toContainText('1... e5', { timeout: RESULT });
  await expect(panel(page)).toContainText('Book', { timeout: RESULT });
  await expect(panel(page)).toContainText('A well-known opening move.');
  await expect(panel(page)).toContainText('Next in the book:');

  // A move that is not legal springs back and changes nothing.
  await tap(page, 'g1', 'g4');
  await expect.poll(() => movesInAddress(page)).toBe('e2e4,e7e5');

  // The engine's three lines and the best-move arrow.
  await page.getByRole('tab', { name: 'Lines' }).click();
  await expect(
    panel(page)
      .locator('p')
      .filter({ hasText: /^[+−-]?\d|^#/ }),
  ).toHaveCount(3, {
    timeout: RESULT,
  });
  await expect(panel(page)).toContainText('Depth 18 · 5 s per move.');
  await expect(page.locator('svg.cg-shapes line')).toHaveCount(1);

  // The Moves list jumps.
  await page.getByRole('tab', { name: 'Moves' }).click();
  await panel(page).getByRole('button', { name: 'e4' }).click();
  await page.getByRole('tab', { name: 'Move', exact: true }).click();
  await expect(panel(page)).toContainText('1. e4');

  // Another move than the next one replaces the rest of the line.
  await tap(page, 'c7', 'c5');
  await expect.poll(() => movesInAddress(page)).toBe('e2e4,c7c5');

  // A reload keeps the board.
  await page.reload();
  await expect(panel(page)).toContainText('1... c5', { timeout: RESULT });
  expect(errors).toEqual([]);
});

test('analysis board - a mistake gets the label and the better move', async ({ page }) => {
  await page.goto('/analysis?moves=e2e4,e7e5,g1f3,f7f6');
  await expect(panel(page)).toContainText('Mistake', { timeout: RESULT });
  await expect(panel(page)).toContainText('Win chance dropped');
  await expect(panel(page)).toContainText('Better was 2... Nf6');
  await expect(page.getByText("King's Pawn Game: Damiano Defense")).toBeVisible();
});

test('analysis board - an address with a wrong move keeps the legal ones before it', async ({
  page,
}) => {
  await page.goto('/analysis?moves=e2e4,e7e5,zzzz,g1f3');
  await expect.poll(() => movesInAddress(page)).toBe('e2e4,e7e5');
});

test('analysis board - settings are used at once and kept on the device', async ({ page }) => {
  await page.goto('/analysis?moves=d2d4');
  const bar = page.locator('[class*="EvalBar"], [aria-label^="Evaluation"]').first();
  await page.getByRole('button', { name: 'Analysis settings' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await sheet.getByText('Evaluation bar').click();
  await sheet.getByText('Suggestion arrow').click();
  await sheet.getByRole('combobox', { name: 'Time per move' }).selectOption('2');
  await expect(sheet).toContainText('2 s');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
  await expect(bar).toHaveCount(0);

  await page.getByRole('tab', { name: 'Lines' }).click();
  await expect(panel(page)).toContainText('Depth 18 · 2 s per move.', { timeout: RESULT });
  await expect(page.locator('svg.cg-shapes line')).toHaveCount(0);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cbm.analysis')!));
  expect(stored).toMatchObject({ evalBar: false, suggestion: false, seconds: 2 });
  await page.reload();
  await expect(bar).toHaveCount(0);
});

test('analysis board - the threat arrow, when turned on, shows what the other side threatens', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('cbm.analysis', '{"threat":true}'));
  // 1. e4 e5 2. Bc4 Nc6 3. Qh5: Black to move, and Qxf7 is mate if Black passes.
  await page.goto('/analysis?moves=e2e4,e7e5,f1c4,b8c6,d1h5');
  await expect(page.locator('svg.cg-shapes line')).toHaveCount(2, { timeout: RESULT });
  const ends = await page.evaluate(() =>
    [...document.querySelectorAll('svg.cg-shapes g')]
      .map((group) => group.getAttribute('cgHash') ?? '')
      .join(' '),
  );
  expect(ends).toContain('threat');
});

/** The board as drawn (its frame), the bar beside it, and the edges that must line up with it. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const card = document.querySelector('#analysis-panel')!;
    const board = document.querySelector('[data-palette]')!.getBoundingClientRect();
    const bar = document.querySelector('[data-palette]')!.parentElement!.firstElementChild!;
    return {
      board,
      barLeft: bar.getBoundingClientRect().left,
      back: rect('header button'),
      settings: rect('header button[aria-haspopup]'),
      tabs: rect('[role="tablist"]'),
      card: rect('#analysis-panel'),
      stepper: rect('[class*="stepper"]'),
      contentHeight: card.scrollHeight,
      pageScroll: document.scrollingElement!.scrollHeight - innerHeight,
      gutter: parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--gutter-board'),
      ),
    };
  });
}

// Phones as phones (no scroll bar taking width), the iPad as a desktop browser.
for (const [width, height, phone] of [
  [390, 844, true],
  [402, 874, true],
  [375, 667, true],
  [1180, 820, false],
] as const) {
  test.describe(`analysis board ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, isMobile: phone, hasTouch: phone });

    test('the board is as big as the narrow margin allows, edges line up, nothing under the step bar', async ({
      page,
    }) => {
      await page.goto('/analysis?moves=e2e4,e7e5,g1f3,f7f6');
      await expect(panel(page)).toContainText('Mistake', { timeout: RESULT });
      for (const tab of ['Move', 'Lines', 'Moves']) {
        const button = page.getByRole('tab', { name: tab, exact: true });
        if ((await button.count()) === 0) continue; // wide screens keep the move table instead
        await button.click();
        const box = await layout(page);
        expect(box.pageScroll, tab).toBe(0);
        // As tall as its content, never stretched with empty grey below.
        expect(Math.round(box.card.height), tab).toBeLessThanOrEqual(box.contentHeight);
        if (tab === 'Move')
          expect(box.contentHeight, tab).toBeLessThanOrEqual(Math.ceil(box.card.height));
        if (!phone) continue;
        expect(box.card.bottom, tab).toBeLessThanOrEqual(box.stepper.top);
        expect(box.board.bottom, tab).toBeLessThanOrEqual(box.stepper.top);
        // One left edge and one right edge for the header, the bar and board, the tabs and the card.
        for (const left of [box.back.left, box.tabs.left, box.card.left, box.stepper.left]) {
          expect(Math.abs(left - box.barLeft), tab).toBeLessThanOrEqual(1);
        }
        for (const right of [
          box.settings.right,
          box.tabs.right,
          box.card.right,
          box.stepper.right,
        ]) {
          expect(Math.abs(right - box.board.right), tab).toBeLessThanOrEqual(1);
        }
      }
      const box = await layout(page);
      console.log(`${width}x${height}: board ${Math.round(box.board.width)} px`);
      if (!phone) return;
      // The smaller of the width (the screen less two narrow margins, the bar 14 and its gap 6) and
      // the height left; when the width decides, the bar starts at the narrow margin.
      const byWidth = width - 2 * box.gutter - 20;
      expect(box.board.width).toBeLessThanOrEqual(byWidth + 0.5);
      if (Math.abs(box.board.width - byWidth) <= 0.5)
        expect(box.barLeft).toBeCloseTo(box.gutter, 0);
    });
  });
}

test.describe('the review screen keeps its board', () => {
  test.use({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });

  test('402x874: the review board is still the width less the 20px margins, the bar and its gap', async ({
    page,
  }) => {
    await seed(page, '/review/lichess%3ALAGvRNey');
    const width = await page.evaluate(
      () => document.querySelector('[data-palette]')!.getBoundingClientRect().width,
    );
    console.log(`review 402x874: board ${Math.round(width)} px`);
    expect(Math.round(width)).toBe(402 - 40 - 20);
  });
});
