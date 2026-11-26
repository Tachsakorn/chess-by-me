/**
 * Helpers for the release tests (1.1.1, Fable review 1.1 area 8 tests 1-4): the production build
 * served as the real site serves it (wrangler dev from deploy/production: the Worker, the
 * _headers, the single-page fallback), browsers that keep their profile across restarts, and
 * a watch on console errors and CSP violations.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';

export const GAMES = [
  '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *',
  '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O *',
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *',
  '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 *',
] as const;

const executablePath = process.env.CHROMIUM_PATH;

/** A new folder for a browser profile that lives through restarts. */
export function newProfile(name: string): string {
  return mkdtempSync(join(tmpdir(), `cbm-${name}-`));
}

/** A browser on `profile`, with service workers, as a person's browser is. */
export function openBrowser(profile: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'allow',
    ...(executablePath
      ? { executablePath, args: ['--no-sandbox'] }
      : { channel: 'msedge' as const }),
  });
}

/**
 * Collects console errors, page errors and CSP violations of every page of `context` (pages made
 * later too). The list fills as they happen.
 */
export function watchErrors(context: BrowserContext): string[] {
  const errors: string[] = [];
  const watch = (page: Page) => {
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  };
  void context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  context.pages().forEach(watch);
  context.on('page', watch);
  return errors;
}

/** Waits until the page's service worker controls it. */
export async function controlled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 15_000,
    })
    .toBe(true);
}

/** Pastes `pgn` through Search and waits for the analysis to end; returns how it ended. */
export async function analyse(page: Page, base: string, pgn: string): Promise<'done' | 'failed'> {
  await page.goto(`${base}/search`);
  await page.getByRole('button', { name: /Paste PGN/ }).click();
  await page.getByRole('dialog').getByRole('textbox').fill(pgn);
  await page.getByRole('dialog').getByRole('button', { name: 'Review' }).click();
  await page.waitForURL(/\/review\//);
  return waitAnalysis(page);
}

export async function waitAnalysis(page: Page): Promise<'done' | 'failed'> {
  const panel = page.locator('#review-panel');
  await expect(panel).toContainText(/Drag a piece to try your own move|didn.t finish/, {
    timeout: 180_000,
  });
  return (await panel.textContent())?.includes('Drag a piece') ? 'done' : 'failed';
}

/** The address of the review shown now. */
export function reviewAddress(page: Page): string {
  return new URL(page.url()).pathname;
}

/** Drags a piece of the board, from one square to another (board seen from White). */
export async function drag(page: Page, from: string, to: string): Promise<void> {
  const spot = (square: string) =>
    page.evaluate((name) => {
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
  const start = await spot(from);
  const end = await spot(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
}

/** At the start of a finished review: tries 1. d4 (the game played 1. e4) and waits for its label. */
export async function tryAMove(page: Page): Promise<void> {
  await drag(page, 'd2', 'd4');
  await expect(page.getByText(/Your line/)).toBeVisible();
  await expect(page.locator('#review-panel')).not.toContainText(/Checking/, { timeout: 60_000 });
  await expect(page.locator('#review-panel')).toContainText(/1\. d4/);
}
