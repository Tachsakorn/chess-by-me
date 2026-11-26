import { expect, test } from '@playwright/test';
import { seed } from './support';

/**
 * A phone on its side (1.1.1, Fable review 1.1 B6-01): the review shows the board, in two
 * columns, without scrolling. Portrait phones keep the board they had.
 */
const REVIEW = `/review/${encodeURIComponent('lichess:LAGvRNey')}`;

for (const [width, height, wantAtLeast] of [
  [844, 390, 280],
  [667, 375, 260],
  [852, 393, 280],
  [932, 430, 320],
] as const) {
  test(`landscape - ${width}x${height}: the board is there, beside the panels`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await seed(page, REVIEW);
    const board = await page.locator('cg-board').first().boundingBox();
    expect(board?.width ?? 0).toBeGreaterThanOrEqual(wantAtLeast);
    const panel = await page.locator('#review-panel').boundingBox();
    // Two columns: the panel is to the right of the board.
    expect(panel!.x).toBeGreaterThan(board!.x + board!.width);
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - innerHeight)).toBe(
      0,
    );
  });
}

for (const [width, height, size] of [
  [390, 844, 328],
  [393, 659, 248],
  [430, 739, 328],
] as const) {
  test(`landscape - portrait ${width}x${height} keeps its board`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await seed(page, REVIEW);
    const board = await page.locator('cg-board').first().boundingBox();
    expect(Math.round(board!.width)).toBe(size);
  });
}
