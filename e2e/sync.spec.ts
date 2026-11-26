import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import { seed } from './support';

/**
 * Games from the sites arrive without gaps and without closing the app (1.1.1, Fable review 1.1
 * B5-03, B5-04). Lichess and Chess.com are answered here; their games are a fixture game under
 * made-up ids (test data only).
 */
const pgn = JSON.parse(
  readFileSync(new URL('../fixtures/lichess-HKl8S22m/game.json', import.meta.url), 'utf8'),
).pgn as string;
const JSON_CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
const HOUR = 3600_000;

/** Stored games per owner. */
function owners(page: Page): Promise<Record<string, number>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, number>>((resolve) => {
        const open = indexedDB.open('chessbyme');
        open.onsuccess = () => {
          const all = open.result.transaction('games').objectStore('games').getAll();
          all.onsuccess = () => {
            open.result.close();
            const out: Record<string, number> = {};
            for (const row of all.result as { owner: string }[]) {
              out[row.owner] = (out[row.owner] ?? 0) + 1;
            }
            resolve(out);
          };
        };
      }),
  );
}

/** A Lichess that holds `count` games played after the fixtures, and honours since/until/max. */
async function lichessWithNewGames(page: Page, count: number, seen: string[] = []): Promise<void> {
  const first = Date.UTC(2026, 10, 14); // after the newest fixture game (13 November)
  const games = Array.from({ length: count }, (_, i) => ({
    id: `New${String(i).padStart(5, '0')}`,
    createdAt: first + i * HOUR,
  }));
  await page.route('https://lichess.org/api/games/user/**', (route: Route) => {
    const url = new URL(route.request().url());
    seen.push(url.search);
    const since = Number(url.searchParams.get('since') ?? 0);
    const until = Number(url.searchParams.get('until') ?? Infinity);
    const max = Number(url.searchParams.get('max') ?? 50);
    const lines = games
      .filter((g) => g.createdAt >= since && g.createdAt <= until)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, max)
      .map((g) =>
        JSON.stringify({ ...g, variant: 'standard', rated: true, status: 'resign', pgn }),
      );
    return route.fulfill({
      status: 200,
      headers: { ...JSON_CORS, 'content-type': 'application/x-ndjson' },
      body: lines.map((line) => `${line}\n`).join(''),
    });
  });
  await page.route('https://lichess.org/api/user/**', (route) =>
    route.fulfill({
      status: 200,
      headers: JSON_CORS,
      body: '{"id":"ni5hu","username":"ni5hu","perfs":{}}',
    }),
  );
}

test('sync - more than 50 Lichess games since the last visit: none is missed', async ({ page }) => {
  await lichessWithNewGames(page, 80);
  await seed(page, '/games');
  // The three fixture games, and all 80 new ones.
  await expect.poll(() => owners(page), { timeout: 15_000 }).toEqual({ 'lichess:ni5hu': 83 });
});

/** Chess.com archive address of the month `back` months before this one. */
function monthUrl(back: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `https://api.chess.com/pub/player/testplayer/games/${d.getUTCFullYear()}/${month}`;
}

function chessComGames(prefix: string, count: number, monthsBack: number) {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1) / 1000;
  return Array.from({ length: count }, (_, i) => ({
    url: `https://www.chess.com/game/live/${prefix}${i}`,
    uuid: `${prefix}-0000-4000-8000-${String(i).padStart(12, '0')}`,
    end_time: start + (i + 1) * 3600,
    rated: true,
    rules: 'chess',
    time_class: 'blitz',
    time_control: '180',
    pgn,
    white: { username: 'TestPlayer', rating: 1500, result: 'win' },
    black: { username: 'Other', rating: 1500, result: 'resigned' },
  }));
}

/** The game records the app would have stored for these Chess.com games. */
function storedFrom(page: Page, games: ReturnType<typeof chessComGames>): Promise<unknown[]> {
  return page.evaluate(async (list) => {
    const MODULE = '/src/data/pgn.ts';
    const { gameFromPgn } = (await import(MODULE)) as {
      gameFromPgn(text: string, known: Record<string, unknown>): unknown;
    };
    return list.map((g) =>
      gameFromPgn(g.pgn, { id: `chesscom:${g.uuid}`, source: 'chesscom', sourceUrl: g.url }),
    );
  }, games);
}

test('sync - a new Chess.com month with 50+ games: the end of the last month is not missed', async ({
  page,
}) => {
  const last = chessComGames('aaaaaaaa', 20, 1);
  const thisMonth = chessComGames('bbbbbbbb', 60, 0);
  await page.route('https://api.chess.com/**', (route) => {
    const url = route.request().url();
    const body = url.endsWith('/games/archives')
      ? { archives: [monthUrl(1), monthUrl(0)] }
      : url === monthUrl(0)
        ? { games: thisMonth }
        : url === monthUrl(1)
          ? { games: last }
          : url.endsWith('/stats')
            ? {}
            : { username: 'TestPlayer', url: 'https://www.chess.com/member/TestPlayer' };
    return route.fulfill({ status: 200, headers: JSON_CORS, body: JSON.stringify(body) });
  });
  // The last visit was early last month: its first 10 games are stored.
  await page.goto('/dev/seed/?none=1&go=%2Fsettings');
  await page.waitForURL((url) => !url.pathname.startsWith('/dev/'));
  const stored = await storedFrom(page, last.slice(0, 10));
  await page.evaluate(async (games) => {
    const MODULE = '/src/data/local.ts';
    const { local } = (await import(MODULE)) as {
      local: {
        setAccounts(accounts: unknown): Promise<void>;
        putGames(list: unknown[], owner: string): Promise<void>;
      };
    };
    await local.setAccounts({ lichess: null, chesscom: 'TestPlayer', primary: 'chesscom' });
    await local.putGames(games, 'chesscom:testplayer');
  }, stored);
  await page.goto('/games');
  await expect.poll(() => owners(page), { timeout: 15_000 }).toEqual({ 'chesscom:testplayer': 80 });
});

test('sync - coming back to the app updates the games, at most every 5 minutes', async ({
  page,
}) => {
  await page.clock.install();
  const seen: string[] = [];
  await lichessWithNewGames(page, 0, seen);
  await seed(page, '/games');
  await expect.poll(() => seen.length).toBe(1);
  const comeBack = () =>
    page.evaluate(() => {
      for (const state of ['hidden', 'visible']) {
        Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }
    });
  // Back after a minute: too soon, nothing is asked.
  await page.clock.fastForward('01:00');
  await comeBack();
  await page.waitForTimeout(1000);
  expect(seen).toHaveLength(1);
  // Back after five more minutes: the games are updated.
  await page.clock.fastForward('05:00');
  await comeBack();
  await expect.poll(() => seen.length).toBe(2);
});

test('sync - "Try again in a moment" is a button that asks the site again', async ({ page }) => {
  await page.clock.install();
  const asked: string[] = [];
  await page.route('https://lichess.org/**', (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 429, headers: JSON_CORS, body: '{}' });
  });
  await seed(page, '/games');
  const retry = page.getByRole('button', { name: /Try again in a moment/ });
  await expect(retry).toBeVisible();
  const before = asked.length;
  // The app leaves the site alone for a minute after a 429 (src/data/http.ts); then a tap asks.
  await page.clock.fastForward('01:05');
  await retry.click();
  await expect.poll(() => asked.length).toBeGreaterThan(before);
  // On Home too.
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('button', { name: /Try again in a moment/ })).toBeVisible();
});
