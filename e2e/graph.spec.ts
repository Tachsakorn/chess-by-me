import { expect, test, type Page } from '@playwright/test';
import { GRAPH_INSET, graphHeight, graphX } from '../src/ui/review/graph';
import { seed } from './support';

/**
 * The evaluation graph of the review screen (owner, 1.1 round 3): its height follows the room the
 * board leaves, a dot on a won position shows whole, and a tap or a drag still goes to a move.
 * LAGvRNey is left at ply 84, a blunder by Black after which White is winning outright: the dot
 * of the move on the board sits at the very top of the graph.
 */
const SIZES = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 402, height: 874 },
  { width: 430, height: 932 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
];

const graph = (page: Page) => page.getByRole('img', { name: /Evaluation across the game/ });
const title = (page: Page) => page.getByRole('tabpanel').locator('.t-move-title');

for (const size of SIZES) {
  test(`graph - height, whole dots and tap or drag at ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await seed(page, `/review/${encodeURIComponent('lichess:LAGvRNey')}`, 'LAGvRNey', 84);
    const box = (await graph(page).boundingBox())!;

    // What the board may take across and down, as ReviewScreen.module.css works it out with no
    // safe areas (5px above the header, the step bar 12px off the bottom, 418px of fixed rows).
    const evalBar = size.width >= 700 ? 26 : 20;
    const byWidth = Math.min(size.width - 40 - evalBar, 640 - 40 - evalBar);
    const byHeight = size.height - 5 - 418 - 12;
    const expected = graphHeight({
      byWidth,
      byHeight,
      short: size.height < 760,
      wide: size.width >= 900,
    });
    expect(box.height).toBeCloseTo(expected, 0);

    // The page still fits the screen.
    expect(
      await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight),
    ).toBe(0);

    // The dot of the move on the board, at the top, lies whole inside the graph.
    const current = graph(page).locator('circle[r="4"]');
    const cy = Number(await current.getAttribute('cy'));
    expect(cy).toBe(GRAPH_INSET);
    expect(cy - 4).toBeGreaterThanOrEqual(0);

    // Round 4: every dot and the line lie whole inside the graph at the left and right as well.
    const dots = await graph(page)
      .locator('circle')
      .evaluateAll((list) =>
        list.map((c) => ({ cx: Number(c.getAttribute('cx')), r: Number(c.getAttribute('r')) })),
      );
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) {
      expect(dot.cx - dot.r).toBeGreaterThanOrEqual(0);
      expect(dot.cx + dot.r).toBeLessThanOrEqual(box.width);
    }
    const xs = (
      await graph(page)
        .locator('polyline')
        .evaluate((line) => line.getAttribute('points')!)
    )
      .split(' ')
      .map((pair) => Number(pair.split(',')[0]));
    expect(Math.min(...xs)).toBeCloseTo(GRAPH_INSET, 5);
    expect(Math.max(...xs)).toBeCloseTo(box.width - GRAPH_INSET, 5);

    // A tap on the place of the first move and of the move before last, near both edges, goes
    // to that move.
    await page.mouse.click(box.x + graphX(1 / 85, box.width), box.y + box.height / 2);
    await expect(title(page)).toHaveText(/^1\. /);
    await page.mouse.click(box.x + graphX(84 / 85, box.width), box.y + box.height / 2);
    await expect(title(page)).toHaveText(/^42\.\.\. /);

    // A tap over ply 43 (22. White) goes there, a drag to the right edge to the last move.
    await page.mouse.click(box.x + (box.width * 43) / 85, box.y + box.height / 2);
    await expect(title(page)).toHaveText(/^22\. /);
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + 4, { steps: 5 });
    await page.mouse.move(box.x + box.width - 1, box.y + box.height - 2, { steps: 5 });
    await page.mouse.up();
    await expect(title(page)).toHaveText(/^43\. /);
  });
}

test.describe('with a finger', () => {
  test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

  test('graph - a tap near its foot goes to the move, not to the control below', async ({
    page,
  }) => {
    await seed(page, `/review/${encodeURIComponent('lichess:LAGvRNey')}`, 'LAGvRNey', 84);
    const box = (await graph(page).boundingBox())!;
    // Where ply 21 (11. White) is drawn, 3px above the graph's foot.
    await page.touchscreen.tap(box.x + graphX(21 / 85, box.width), box.y + box.height - 3);
    await expect(title(page)).toHaveText(/^11\. /);
    // Round 4: a finger on the place of the move before last, by the right edge.
    await page.touchscreen.tap(box.x + graphX(84 / 85, box.width), box.y + box.height / 2);
    await expect(title(page)).toHaveText(/^42\.\.\. /);
    await expect(page.getByRole('tab', { name: 'Move', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
