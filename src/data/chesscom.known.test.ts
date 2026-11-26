import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

// Fable review 1.1 B5-01: every open read and stored the whole current Chess.com month again,
// a PGN parse per game (28 ms each; 220 games froze the app for seconds). Games already stored
// are now skipped by id, before their PGN is read.
const parse = vi.hoisted(() => ({ calls: 0 }));
vi.mock('./pgn', async (original) => {
  const actual = await original<typeof import('./pgn')>();
  return {
    ...actual,
    gameFromPgn: (...args: Parameters<typeof actual.gameFromPgn>) => {
      parse.calls += 1;
      return actual.gameFromPgn(...args);
    },
  };
});
const { fetchChessComRecent } = await import('./chesscom');

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');
const archivesText = read('chesscom-archives.json');
const archives = (JSON.parse(archivesText) as { archives: string[] }).archives;
const newest = archives[archives.length - 1]!;
const monthText = read('chesscom-month.json');
const month = JSON.parse(monthText) as { games: { uuid: string; rules: string }[] };
const ARCHIVES_URL = 'https://api.chess.com/pub/player/hikaru/games/archives';
const fetchStub = (async (input: RequestInfo | URL) => {
  const routes: Record<string, string> = { [ARCHIVES_URL]: archivesText, [newest]: monthText };
  return new Response(routes[String(input)] ?? '{"games":[]}', { status: 200 });
}) as typeof fetch;
const ids = month.games.filter((g) => g.rules === 'chess').map((g) => `chesscom:${g.uuid}`);

describe('fetchChessComRecent with the games already stored (B5-01)', () => {
  it('reads the PGN of new games only and returns only those', async () => {
    parse.calls = 0;
    const r = await fetchChessComRecent('hikaru', {
      fetch: fetchStub,
      known: new Set(ids.slice(1)),
      minGames: 1,
    });
    expect(parse.calls).toBe(1);
    expect(r.result.ok && r.result.games.map((g) => g.id)).toEqual([ids[0]]);
  });

  it('with every game stored: no PGN read, an empty list, and that is not a failure', async () => {
    parse.calls = 0;
    const r = await fetchChessComRecent('hikaru', {
      fetch: fetchStub,
      known: new Set(ids),
      minGames: 1,
    });
    expect(parse.calls).toBe(0);
    expect(r.result).toEqual({ ok: true, games: [], skipped: 0 });
  });
});

describe('fetchChessComRecent catching up (Fable review 1.1 B5-03)', () => {
  const base = 'https://api.chess.com/pub/player/x/games/';
  const months = ['2026/08', '2026/09', '2026/10', '2026/11'].map((m) => `${base}${m}`);
  const gamesOf = (m: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...month.games[0],
      uuid: `m${m}-${i}`,
      end_time: m * 1000 + i,
    }));
  const site = (counts: number[]) => {
    const calls: string[] = [];
    const fetchStub = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const at = months.indexOf(url);
      const body = url.endsWith('/archives')
        ? { archives: months }
        : { games: gamesOf(at, counts[at] ?? 0) };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    return { fetch: fetchStub, calls };
  };

  it('reads back to the month of the last visit, even past a month of 50+ games', async () => {
    const s = site([30, 30, 30, 60]);
    const r = await fetchChessComRecent('x', { fetch: s.fetch, known: new Set(['chesscom:m1-0']) });
    expect(s.calls.slice(1)).toEqual([months[3], months[2], months[1]]);
    expect(r.result.ok && r.result.games.length).toBe(60 + 30 + 29);
    // About 120 games read: seconds when the whole suite runs at once.
  }, 30_000);

  it('a new account reads as before: the newest month, the one before only if few games', async () => {
    const s = site([30, 30, 30, 60]);
    await fetchChessComRecent('x', { fetch: s.fetch });
    expect(s.calls.slice(1)).toEqual([months[3]]);
  });
});
