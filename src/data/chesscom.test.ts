import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Termination } from '@/contract';
import { archiveClosed, fetchChessComGames, fetchChessComRecent } from './chesscom';

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');
const archivesText = read('chesscom-archives.json');
const archives = (JSON.parse(archivesText) as { archives: string[] }).archives;
const newest = archives[archives.length - 1]!;
const second = archives[archives.length - 2]!;
const monthText = read('chesscom-month.json');
const prevText = read('chesscom-prev-month.json');
type Raw = { games: Record<string, any>[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
const month = JSON.parse(monthText) as Raw;

function stub(
  routes: Record<string, string | number | (() => never)>,
  calls: string[] = [],
): { fetch: typeof fetch; calls: string[] } {
  const fetchStub = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (route === undefined) throw new Error(`unexpected request ${url}`);
    if (typeof route === 'function') return route();
    if (typeof route === 'number') return new Response('x', { status: route });
    return new Response(route, { status: 200 });
  }) as typeof fetch;
  return { fetch: fetchStub, calls };
}

const ARCHIVES_URL = 'https://api.chess.com/pub/player/hikaru/games/archives';
const standard = () =>
  stub({ [ARCHIVES_URL]: archivesText, [newest]: monthText, [second]: prevText });

describe('fetchChessComGames', () => {
  it('requests the archive list with a trimmed, lowercased, encoded name', async () => {
    const s = stub({ 'https://api.chess.com/pub/player/a%20b/games/archives': 404 });
    const r = await fetchChessComGames('  A B ', { fetch: s.fetch });
    expect(s.calls).toEqual(['https://api.chess.com/pub/player/a%20b/games/archives']);
    expect(r).toMatchObject({ ok: false, error: { code: 'user-not-found' } });
  });

  it('adds exactly one more archive when the newest holds fewer than minGames', async () => {
    const s = standard();
    const r = await fetchChessComGames('Hikaru', { fetch: s.fetch });
    expect(s.calls).toEqual([ARCHIVES_URL, newest, second]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.games).toHaveLength(12);
  });

  it('requests only one archive when it is enough', async () => {
    const s = standard();
    const r = await fetchChessComGames('hikaru', { fetch: s.fetch, minGames: 5 });
    expect(s.calls).toEqual([ARCHIVES_URL, newest]);
    if (r.ok) expect(r.games).toHaveLength(6);
  });

  it('never requests a third archive', async () => {
    const s = standard();
    await fetchChessComGames('hikaru', { fetch: s.fetch, minGames: 10000 });
    expect(s.calls).toHaveLength(3);
  });

  it('maps fields from the recorded games, newest first', async () => {
    const s = standard();
    const r = await fetchChessComGames('hikaru', { fetch: s.fetch, minGames: 5 });
    if (!r.ok) throw new Error('expected ok');
    const ends = month.games.map((g) => g.end_time as number);
    const sorted = [...month.games].sort((a, b) => b.end_time - a.end_time);
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
    expect(r.games.map((g) => g.id)).toEqual(sorted.map((g) => `chesscom:${g.uuid}`));
    const raw = sorted[0]!;
    const g = r.games[0]!;
    expect(g.source).toBe('chesscom');
    expect(g.sourceUrl).toBe(raw.url);
    expect(g.white.rating).toBe(raw.white.rating);
    expect(g.black.rating).toBe(raw.black.rating);
    expect(g.white.name).toBe(raw.white.username);
    expect(g.timeControl?.timeClass).toBe(raw.time_class);
    expect(g.timeControl?.raw).toBe(raw.time_control);
    expect(g.rated).toBe(raw.rated);
    expect(g.moves.length).toBeGreaterThan(10);
    expect(g.moves[0]!.clockSeconds).not.toBeNull();
    expect(g.playedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(g.pgn).toBe(raw.pgn);
  });

  it('sorts across archives by end_time descending', async () => {
    const s = standard();
    const r = await fetchChessComGames('hikaru', { fetch: s.fetch });
    if (!r.ok) throw new Error('expected ok');
    const all = [...month.games, ...(JSON.parse(prevText) as Raw).games].sort(
      (a, b) => b.end_time - a.end_time,
    );
    expect(r.games.map((g) => g.id)).toEqual(all.map((g) => `chesscom:${g.uuid}`));
  });

  it('skips and counts games whose rules are not chess', async () => {
    // Hand-made variation of a real recorded game: only the rules field is changed.
    const changed = structuredClone(month) as Raw;
    changed.games[0]!.rules = 'chess960';
    const s = stub({ [ARCHIVES_URL]: archivesText, [newest]: JSON.stringify(changed) });
    const r = await fetchChessComGames('hikaru', { fetch: s.fetch, minGames: 5 });
    expect(r).toMatchObject({ ok: true, skipped: 1 });
    if (r.ok) expect(r.games).toHaveLength(5);
  });

  const table: [string, string, Termination][] = [
    ['checkmated', 'white', 'checkmate'],
    ['resigned', 'black', 'resignation'],
    ['timeout', 'white', 'timeout'],
    ['abandoned', 'black', 'abandonment'],
    ['stalemate', 'draw', 'stalemate'],
    ['repetition', 'draw', 'repetition'],
    ['agreed', 'draw', 'agreement'],
    ['insufficient', 'draw', 'insufficient-material'],
    ['50move', 'draw', 'fifty-move'],
    ['timevsinsufficient', 'draw', 'timeout-vs-insufficient-material'],
  ];
  it.each(table)('maps result code %s (%s) to %s', async (code, who, expected) => {
    const changed = structuredClone(month) as Raw;
    const g = changed.games[5]!; // the newest game
    if (who === 'draw') {
      g.white.result = code;
      g.black.result = code;
    } else {
      g.white.result = who === 'white' ? code : 'win';
      g.black.result = who === 'black' ? code : 'win';
    }
    const s = stub({ [ARCHIVES_URL]: archivesText, [newest]: JSON.stringify(changed) });
    const r = await fetchChessComGames('hikaru', { fetch: s.fetch, minGames: 5 });
    if (!r.ok) throw new Error('expected ok');
    expect(r.games[0]!.id).toBe(`chesscom:${g.uuid}`);
    expect(r.games[0]!.termination).toBe(expected);
  });

  it('maps errors', async () => {
    expect(
      await fetchChessComGames('x', {
        fetch: stub({ [ARCHIVES_URL.replace('hikaru', 'x')]: 404 }).fetch,
      }),
    ).toMatchObject({ ok: false, error: { code: 'user-not-found' } });
    const url = 'https://api.chess.com/pub/player/x/games/archives';
    expect(
      await fetchChessComGames('x', {
        fetch: stub({ [url]: JSON.stringify({ archives: [] }) }).fetch,
      }),
    ).toMatchObject({ ok: false, error: { code: 'no-games' } });
    expect(await fetchChessComGames('x', { fetch: stub({ [url]: 429 }).fetch })).toMatchObject({
      ok: false,
      error: { code: 'rate-limited' },
    });
    expect(await fetchChessComGames('x', { fetch: stub({ [url]: 500 }).fetch })).toMatchObject({
      ok: false,
      error: { code: 'source-unavailable' },
    });
    const m = stub({
      [url]: JSON.stringify({ archives: ['https://api.chess.com/m'] }),
      'https://api.chess.com/m': 404,
    });
    expect(await fetchChessComGames('x', { fetch: m.fetch })).toMatchObject({
      ok: false,
      error: { code: 'source-unavailable' },
    });
  });

  it('maps a rejecting fetch to network and an abort to cancelled', async () => {
    const net = await fetchChessComGames('x', {
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as typeof fetch,
    });
    expect(net).toMatchObject({ ok: false, error: { code: 'network' } });
    const abort = await fetchChessComGames('x', {
      fetch: (async () => {
        throw new DOMException('aborted', 'AbortError');
      }) as typeof fetch,
    });
    expect(abort).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    const controller = new AbortController();
    controller.abort();
    const pre = await fetchChessComGames('x', {
      fetch: standard().fetch,
      signal: controller.signal,
    });
    expect(pre).toMatchObject({ ok: false, error: { code: 'cancelled' } });
  });
});

// Fable review A4-01, the part left after round 38: Chess.com has no "since", so the app does not
// read a month again once it is over and stored, and lets the browser ask "changed?" (ETag, 304)
// for the month still being played.
describe('archiveClosed', () => {
  const nov = 'https://api.chess.com/pub/player/hikaru/games/2026/11';
  const dec = 'https://api.chess.com/pub/player/hikaru/games/2026/12';

  it('is false while the month is being played and for a day after it ends', () => {
    expect(archiveClosed(nov, Date.UTC(2026, 10, 15))).toBe(false);
    expect(archiveClosed(nov, Date.UTC(2026, 11, 1, 23, 59))).toBe(false);
  });

  it('is true from a day after the month ends, December included', () => {
    expect(archiveClosed(nov, Date.UTC(2026, 11, 2))).toBe(true);
    expect(archiveClosed(dec, Date.UTC(2027, 0, 1, 12))).toBe(false);
    expect(archiveClosed(dec, Date.UTC(2027, 0, 2))).toBe(true);
  });

  it('is false for an address that does not end in a year and a month', () => {
    expect(archiveClosed('https://api.chess.com/pub/player/hikaru/games', Date.UTC(2030, 0))).toBe(
      false,
    );
  });
});

describe('fetchChessComRecent', () => {
  const duringNewest = Date.UTC(2026, 10, 15); // newest = 2026/11, second = 2026/10
  const later = Date.UTC(2027, 1, 1);

  it('asks the browser to check its copy with the site on every request (ETag, 304)', async () => {
    const seen: (RequestCache | undefined)[] = [];
    const routes: Record<string, string> = {
      [ARCHIVES_URL]: archivesText,
      [newest]: monthText,
      [second]: prevText,
    };
    const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init?.cache);
      return new Response(routes[String(input)]!, { status: 200 });
    }) as typeof fetch;
    await fetchChessComRecent('hikaru', { fetch: fetchStub, now: duringNewest });
    expect(seen).toEqual(['no-cache', 'no-cache', 'no-cache']);
  });

  it('does not read a month already stored, nor any older one', async () => {
    const s = standard();
    const r = await fetchChessComRecent('hikaru', {
      fetch: s.fetch,
      done: [second],
      now: duringNewest,
    });
    expect(s.calls).toEqual([ARCHIVES_URL, newest]);
    expect(r.result.ok).toBe(true);
    if (r.result.ok) expect(r.result.games).toHaveLength(6);
  });

  it('reads no month at all when the newest one is stored, and that is not a failure', async () => {
    const s = standard();
    const r = await fetchChessComRecent('hikaru', { fetch: s.fetch, done: [newest], now: later });
    expect(s.calls).toEqual([ARCHIVES_URL]);
    expect(r.result).toEqual({ ok: true, games: [], skipped: 0 });
    expect(r.closed).toEqual([]);
  });

  it('names the months it read that are over, so they are not read again', async () => {
    const during = await fetchChessComRecent('hikaru', {
      fetch: standard().fetch,
      now: duringNewest,
    });
    expect(during.closed).toEqual([second]);
    const after = await fetchChessComRecent('hikaru', { fetch: standard().fetch, now: later });
    expect(after.closed).toEqual([newest, second]);
  });

  it('names no month when a request fails', async () => {
    const s = stub({ [ARCHIVES_URL]: archivesText, [newest]: monthText, [second]: 500 });
    const r = await fetchChessComRecent('hikaru', { fetch: s.fetch, now: later });
    expect(r.result.ok).toBe(false);
    expect(r.closed).toEqual([]);
  });
});
