import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fetchChessComGame, gameIdOf } from './chesscomGame';

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');
const archivesText = read('chesscom-archives.json');
const archives = (JSON.parse(archivesText) as { archives: string[] }).archives;
const newest = archives[archives.length - 1]!;
const second = archives[archives.length - 2]!;
const third = archives[archives.length - 3]!;
const monthText = read('chesscom-month.json');
const prevText = read('chesscom-prev-month.json');
const ARCHIVES_URL = 'https://api.chess.com/pub/player/hikaru/games/archives';

function stub(routes: Record<string, string | number>, calls: string[] = []) {
  const fetchStub = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (route === undefined) throw new Error(`unexpected request ${url}`);
    if (typeof route === 'number') return new Response('x', { status: route });
    return new Response(route, { status: 200 });
  }) as typeof fetch;
  return { fetch: fetchStub, calls };
}

const standard = () =>
  stub({
    [ARCHIVES_URL]: archivesText,
    [newest]: monthText,
    [second]: prevText,
    [third]: '{"games":[]}',
  });

describe('gameIdOf', () => {
  it('reads every address form of a Chess.com game', () => {
    expect(gameIdOf('https://www.chess.com/game/live/188816299747')).toEqual({
      kind: 'live',
      id: '188816299747',
    });
    expect(gameIdOf('https://www.chess.com/game/daily/747757185')).toEqual({
      kind: 'daily',
      id: '747757185',
    });
    expect(gameIdOf('https://www.chess.com/live/game/123')).toEqual({ kind: 'live', id: '123' });
    expect(gameIdOf('https://www.chess.com/daily/game/123')).toEqual({ kind: 'daily', id: '123' });
    expect(gameIdOf('https://www.chess.com/analysis/game/live/123?tab=review')).toEqual({
      kind: 'live',
      id: '123',
    });
    expect(gameIdOf('https://www.chess.com/member/hikaru')).toBeNull();
  });
});

describe('fetchChessComGame', () => {
  it('finds a game of the newest month of a player', async () => {
    const s = standard();
    const r = await fetchChessComGame({ kind: 'live', id: '188816899405' }, ['Hikaru'], {
      fetch: s.fetch,
    });
    expect(s.calls).toEqual([ARCHIVES_URL, newest]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.games).toHaveLength(1);
      expect(r.games[0]!.sourceUrl).toBe('https://www.chess.com/game/live/188816899405');
      expect(r.games[0]!.source).toBe('chesscom');
    }
  });

  it('stops after the newest month when the game is newer than all of it', async () => {
    const s = standard();
    const r = await fetchChessComGame({ kind: 'live', id: '999999999999' }, ['hikaru'], {
      fetch: s.fetch,
    });
    expect(s.calls).toEqual([ARCHIVES_URL, newest]);
    expect(r).toMatchObject({ ok: false, error: { code: 'no-games' } });
  });

  describe('an older live game: a binary search over the months', () => {
    // 40 months; month m holds live games m*100+1 .. m*100+3, except months 10-12 (daily only)
    // and month 25, where game 2550 (started late in month 25) is filed under month 26.
    const real = (JSON.parse(monthText) as { games: Record<string, unknown>[] }).games[0]!;
    const base = 'https://api.chess.com/pub/player/many/games/';
    const months = Array.from({ length: 40 }, (_, m) => `${base}m${m}`);
    const gamesOf = (m: number) => {
      if (m >= 10 && m <= 12)
        return [{ url: `https://www.chess.com/game/daily/${m}`, rules: 'chess' }];
      const ids = [1, 2, 3].map((k) => m * 100 + k);
      if (m === 26) ids.push(2550);
      return ids.map((id) => ({
        ...real,
        uuid: `u${id}`,
        url: `https://www.chess.com/game/live/${id}`,
      }));
    };
    const many = () =>
      stub({
        [`${base}archives`]: JSON.stringify({ archives: months }),
        ...Object.fromEntries(months.map((url, m) => [url, JSON.stringify({ games: gamesOf(m) })])),
      });
    const find = (id: number, s: ReturnType<typeof many>) =>
      fetchChessComGame({ kind: 'live', id: String(id) }, ['many'], { fetch: s.fetch });

    it.each([302, 702, 1502, 3902, 3302, 902, 1302, 2550])(
      'finds game %i in few requests',
      async (id) => {
        const s = many();
        const r = await find(id, s);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.games[0]!.sourceUrl).toBe(`https://www.chess.com/game/live/${id}`);
        expect(s.calls.length).toBeLessThanOrEqual(12);
      },
    );

    it('says not found for an id no month holds, without reading every month', async () => {
      const s = many();
      expect(await find(1750, s)).toMatchObject({ ok: false, error: { code: 'no-games' } });
      expect(s.calls.length).toBeLessThanOrEqual(12);
    });
  });

  it('tries the next name when the first player does not exist', async () => {
    const s = stub({
      'https://api.chess.com/pub/player/nobody/games/archives': 404,
      [ARCHIVES_URL]: archivesText,
      [newest]: monthText,
    });
    const r = await fetchChessComGame({ kind: 'live', id: '188816299747' }, ['nobody', 'hikaru'], {
      fetch: s.fetch,
    });
    expect(r.ok).toBe(true);
  });

  it('says the player was not found when no name exists', async () => {
    const s = stub({ 'https://api.chess.com/pub/player/nobody/games/archives': 404 });
    const r = await fetchChessComGame({ kind: 'live', id: '1' }, ['nobody'], { fetch: s.fetch });
    expect(r).toMatchObject({ ok: false, error: { code: 'user-not-found' } });
  });

  it('asks nothing without a name, and the same name only once', async () => {
    const none = stub({});
    expect(
      await fetchChessComGame({ kind: 'live', id: '1' }, [], { fetch: none.fetch }),
    ).toMatchObject({ ok: false, error: { code: 'user-not-found' } });
    expect(none.calls).toEqual([]);
    const s = standard();
    await fetchChessComGame({ kind: 'live', id: '188816299747' }, ['Hikaru', ' hikaru ', ''], {
      fetch: s.fetch,
    });
    expect(s.calls).toEqual([ARCHIVES_URL, newest]);
  });

  it('stops at once on a network failure', async () => {
    const s = stub({ [ARCHIVES_URL]: 500 });
    const r = await fetchChessComGame({ kind: 'live', id: '1' }, ['hikaru', 'other'], {
      fetch: s.fetch,
    });
    expect(r.ok).toBe(false);
    expect(s.calls).toEqual([ARCHIVES_URL]);
  });
});
