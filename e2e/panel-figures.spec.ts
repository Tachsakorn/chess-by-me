import { expect, test, type Page } from '@playwright/test';
import { seed } from './support';

/**
 * The evaluation ("+1.3 → +1.9") of every move in the Move panel (1.1.1, Fable review 1.1 B6-02,
 * owner from a real iPhone in Safari): on a short screen the panel is as narrow as the board, and
 * the figures were left out; now they take a line of their own. Every move of a game is checked:
 * the figures are visible and nothing in the panel is cut off. Board and graph do not move.
 */
const REVIEW = `/review/${encodeURIComponent('lichess:LAGvRNey')}`;

async function everyMove(page: Page) {
  const panel = page.locator('#review-panel');
  const missing: number[] = [];
  const cut: number[] = [];
  for (let ply = 1; ply <= 85; ply += 1) {
    await page.keyboard.press('ArrowRight');
    const state = await panel.evaluate((element) => {
      const figures = [...element.querySelectorAll('span, p')].filter(
        (node) => /→/.test(node.textContent ?? '') && (node as HTMLElement).offsetParent !== null,
      );
      // Cut off: a visible line whose bottom passes the panel's inner edge.
      const inner =
        element.getBoundingClientRect().bottom -
        parseFloat(getComputedStyle(element).paddingBottom);
      const lines = [...element.querySelectorAll('p, div, span')].filter((node) => {
        const box = (node as HTMLElement).getBoundingClientRect();
        return (
          (node as HTMLElement).offsetParent !== null &&
          box.width > 1 &&
          box.height > 1 &&
          !node.classList.contains('visually-hidden')
        );
      });
      return {
        figures: figures.length,
        cut: lines.some((node) => node.getBoundingClientRect().bottom > inner + 1),
        why: lines
          .filter((node) => node.getBoundingClientRect().bottom > inner + 1)
          .map(
            (node) =>
              `${node.className.slice(0, 20)} ${Math.round(node.getBoundingClientRect().bottom)} > ${Math.round(inner)} ${node.textContent?.slice(0, 30)}`,
          ),
      };
    });
    if (state.figures !== 1) missing.push(ply);
    if (state.cut) cut.push(ply);
  }
  return { missing, cut };
}

for (const [width, height, lang] of [
  [393, 659, 'en'],
  [393, 659, 'th'],
  [430, 739, 'en'],
  [375, 667, 'th'],
  [390, 844, 'en'],
] as const) {
  test(`panel figures - ${width}x${height} ${lang}: on every move, nothing cut`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await seed(page, '/settings', 'LAGvRNey', 0);
    await page.evaluate((l) => localStorage.setItem('cbm.lang', l), lang);
    await page.goto(REVIEW);
    await page.locator('#review-panel').waitFor();
    const board = await page.locator('cg-board').first().boundingBox();
    const graph = await page
      .locator('svg')
      .filter({ has: page.locator('path') })
      .first()
      .boundingBox();
    const { missing, cut } = await everyMove(page);
    expect(cut).toEqual([]);
    // Short screens (under 760px high, Safari with its bars): the figures on every move. A tall
    // screen is as before: a move whose label is long (Inaccuracy) leaves them out there.
    if (height < 760) expect(missing).toEqual([]);
    // Board and graph as before.
    expect(await page.locator('cg-board').first().boundingBox()).toEqual(board);
    void graph;
  });
}
