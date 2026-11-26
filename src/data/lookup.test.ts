import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fetchGameByLink, findGameLink, openPasted, parseGameLink, searchPlayers } from './lookup';

const recorded = readFileSync(
  fileURLToPath(new URL('./__fixtures__/lichess-user.ndjson', import.meta.url)),
  'utf8',
);
// One real game as Lichess returns it (recorded 2026-11-13, see __fixtures__/README.md).
const line = JSON.parse(recorded.split('\n')[0]!) as { id: string; pgn: string };

function fakeFetch(routes: Record<string, { status: number; body: unknown }>): typeof fetch {
  return (async (input: string) => {
    const hit = Object.entries(routes).find(([prefix]) => String(input).startsWith(prefix));
    if (!hit) return new Response('', { status: 404 });
    const { status, body } = hit[1];
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe('parseGameLink', () => {
  it('reads Lichess game links, with or without the side or move', () => {
    expect(parseGameLink('https://lichess.org/LAGvRNey')).toEqual({
      source: 'lichess',
      id: 'LAGvRNey',
    });
    expect(parseGameLink('lichess.org/LAGvRNeyAbCd/black#32')).toEqual({
      source: 'lichess',
      id: 'LAGvRNey',
    });
    expect(parseGameLink('  https://www.lichess.org/LAGvRNey  ')).toEqual({
      source: 'lichess',
      id: 'LAGvRNey',
    });
  });

  it('reads Chess.com game links, live and daily, with the player named in them', () => {
    expect(parseGameLink('https://www.chess.com/game/live/123456789')).toEqual({
      source: 'chesscom',
      id: '123456789',
      kind: 'live',
      username: null,
    });
    expect(parseGameLink('https://chess.com/game/daily/987')).toEqual({
      source: 'chesscom',
      id: '987',
      kind: 'daily',
      username: null,
    });
    expect(parseGameLink('https://www.chess.com/game/live/55?username=Hikaru&move=3')).toEqual({
      source: 'chesscom',
      id: '55',
      kind: 'live',
      username: 'Hikaru',
    });
    expect(parseGameLink('www.chess.com/analysis/game/live/77?tab=review')).toMatchObject({
      id: '77',
      kind: 'live',
    });
    expect(parseGameLink('https://www.chess.com/member/hikaru')).toBeNull();
  });

  it('is null for a name or another page', () => {
    expect(parseGameLink('ni5hu')).toBeNull();
    expect(parseGameLink('https://lichess.org/@/ni5hu')).toBeNull();
    expect(parseGameLink('https://lichess.org/training')).toBeNull();
  });
});

describe('findGameLink', () => {
  it('finds the game link in the text an app shares', () => {
    expect(
      findGameLink('Check out this #chess game: https://www.chess.com/game/live/123?username=ab'),
    ).toEqual({ source: 'chesscom', id: '123', kind: 'live', username: 'ab' });
    expect(findGameLink('(see https://lichess.org/LAGvRNey).')).toEqual({
      source: 'lichess',
      id: 'LAGvRNey',
    });
    expect(findGameLink('https://lichess.org/LAGvRNey')).toEqual({
      source: 'lichess',
      id: 'LAGvRNey',
    });
  });

  it('is null without one', () => {
    expect(findGameLink('Look at my profile https://lichess.org/@/ni5hu')).toBeNull();
    expect(findGameLink('1. e4 e5 2. Nf3')).toBeNull();
    expect(findGameLink('')).toBeNull();
  });
});

describe('fetchGameByLink', () => {
  it('fetches one Lichess game and reads it like an imported one', async () => {
    const result = await fetchGameByLink(
      { source: 'lichess', id: line.id },
      {
        fetch: fakeFetch({
          [`https://lichess.org/game/export/${line.id}`]: { status: 200, body: line },
        }),
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const game = result.games[0]!;
    expect(game.id).toBe(`lichess:${line.id}`);
    expect(game.sourceUrl).toBe(`https://lichess.org/${line.id}`);
    expect(game.termination).toBe('resignation');
    expect(game.moves.length).toBeGreaterThan(10);
  });

  it('says when the game does not exist', async () => {
    const result = await fetchGameByLink(
      { source: 'lichess', id: 'nothere1' },
      { fetch: fakeFetch({}) },
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'user-not-found' } });
  });

  /** Every request recorded and answered 404. */
  function notFound() {
    const calls: string[] = [];
    const doFetch = (async (input: string) => {
      calls.push(String(input));
      return new Response('x', { status: 404 });
    }) as unknown as typeof fetch;
    return { calls, doFetch };
  }

  it('opens a Chess.com link only through a player: none known, nothing asked', async () => {
    const { calls, doFetch } = notFound();
    const result = await fetchGameByLink(
      { source: 'chesscom', id: '1', kind: 'live', username: null },
      { fetch: doFetch },
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'user-not-found' } });
    expect(calls).toEqual([]);
  });

  it('asks Chess.com for the archives of the player in the link, then of the names given', async () => {
    const { calls, doFetch } = notFound();
    await fetchGameByLink(
      { source: 'chesscom', id: '1', kind: 'live', username: 'Eric' },
      { fetch: doFetch },
      ['me'],
    );
    expect(calls).toEqual([
      'https://api.chess.com/pub/player/eric/games/archives',
      'https://api.chess.com/pub/player/me/games/archives',
    ]);
  });
});

describe('searchPlayers', () => {
  it('asks Lichess for names that start with the text, and Chess.com for the exact name', async () => {
    const result = await searchPlayers('eric', {
      fetch: fakeFetch({
        'https://lichess.org/api/player/autocomplete': {
          status: 200,
          body: {
            result: [
              { id: 'ericrosen', name: 'EricRosen', title: 'IM' },
              { id: 'eric', name: 'Eric' },
            ],
          },
        },
        'https://api.chess.com/pub/player/eric': { status: 200, body: { username: 'eric' } },
      }),
    });
    expect(result).toEqual({
      ok: true,
      lichess: [
        { source: 'lichess', username: 'EricRosen', title: 'IM' },
        { source: 'lichess', username: 'Eric', title: null },
      ],
      chesscom: [{ source: 'chesscom', username: 'eric', title: null }],
    });
  });

  it('finds nobody without failing when neither site knows the name', async () => {
    const result = await searchPlayers('zzzq', {
      fetch: fakeFetch({
        'https://lichess.org/api/player/autocomplete': { status: 200, body: { result: [] } },
      }),
    });
    expect(result).toEqual({ ok: true, lichess: [], chesscom: [] });
  });

  it('fails only when both sites cannot be reached', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const result = await searchPlayers('eric', { fetch: failing });
    expect(result).toMatchObject({ ok: false, error: { code: 'network' } });
  });
});

// Fable review A2-01 (2026-11-15): "Paste a game link" sent whatever was on the clipboard to
// both sites as a player search. A paste is now judged on the device first.
describe('openPasted', () => {
  function spyFetch() {
    const calls: string[] = [];
    const doFetch = (async (input: string) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({ ...line, variant: 'standard', status: 'mate', createdAt: 0 }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    return { calls, doFetch };
  }

  it('sends nothing for text that is not a game link or a PGN', async () => {
    for (const text of ['Hunter2Secret99', '0812345678', '493817', 'hello world', 'ni5hu', '']) {
      const { calls, doFetch } = spyFetch();
      expect(await openPasted(text, { fetch: doFetch })).toEqual({ kind: 'not-a-game' });
      expect(calls).toEqual([]);
    }
  });

  it('hands a Chess.com link back without sending it: the screen knows whose games to read', async () => {
    const { calls, doFetch } = spyFetch();
    expect(await openPasted('https://www.chess.com/game/live/123', { fetch: doFetch })).toEqual({
      kind: 'chesscom-link',
      link: { source: 'chesscom', id: '123', kind: 'live', username: null },
    });
    expect(calls).toEqual([]);
  });

  it('reads a pasted PGN on the device', async () => {
    const { calls, doFetch } = spyFetch();
    const result = await openPasted(line.pgn, { fetch: doFetch });
    expect(result.kind).toBe('game');
    expect(calls).toEqual([]);
  });

  it('fetches a Lichess game link from Lichess only', async () => {
    const { calls, doFetch } = spyFetch();
    const result = await openPasted(`https://lichess.org/${line.id}`, { fetch: doFetch });
    expect(result.kind).toBe('game');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^https:\/\/lichess\.org\/game\/export\//);
  });
});
