import { describe, expect, it } from 'vitest';
import { checkAccount, fetchRatings } from './ratings';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
    })) as unknown as typeof fetch;
}

// Shapes from the Lichess API reference (GET /api/user/{username}: perfs.<speed>.rating, .games,
// .prog) and the Chess.com Published-Data API (GET /pub/player/{username}/stats:
// chess_<speed>.last.rating). Not recorded from the live services: this machine cannot reach them.
const lichessUser = {
  id: 'someone',
  username: 'Someone',
  perfs: {
    bullet: { games: 120, rating: 1513, rd: 60, prog: 19 },
    blitz: { games: 300, rating: 1354, rd: 50, prog: -23 },
    rapid: { games: 12, rating: 1532, rd: 80, prog: 0, prov: true },
  },
};

describe('fetchRatings from Lichess', () => {
  it('reads rating and progress of each speed', async () => {
    const result = await fetchRatings('lichess', 'someone', {
      fetch: fakeFetch(200, lichessUser),
    });
    expect(result).toEqual({
      ok: true,
      ratings: {
        bullet: { rating: 1513, progress: 19 },
        blitz: { rating: 1354, progress: -23 },
        rapid: { rating: 1532, progress: 0 },
      },
    });
  });

  it('shows nothing for a speed never played', async () => {
    const user = { perfs: { blitz: { games: 0, rating: 1500, prog: 0 } } };
    const result = await fetchRatings('lichess', 'x', { fetch: fakeFetch(200, user) });
    expect(result.ok && result.ratings.blitz).toEqual({ rating: null, progress: null });
    expect(result.ok && result.ratings.bullet).toEqual({ rating: null, progress: null });
  });

  it('reports an unknown user', async () => {
    const result = await fetchRatings('lichess', 'nobody', { fetch: fakeFetch(404, '') });
    expect(result).toMatchObject({ ok: false, error: { code: 'user-not-found' } });
  });

  it('reports a network failure', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const result = await fetchRatings('lichess', 'x', { fetch: failing });
    expect(result).toMatchObject({ ok: false, error: { code: 'network' } });
  });
});

describe('fetchRatings from Chess.com', () => {
  it('reads the last rating of each speed, with no progress figure', async () => {
    const stats = {
      chess_bullet: { last: { rating: 3200, date: 1, rd: 40 } },
      chess_blitz: { last: { rating: 3300, date: 1, rd: 40 } },
    };
    const result = await fetchRatings('chesscom', 'someone', { fetch: fakeFetch(200, stats) });
    expect(result).toEqual({
      ok: true,
      ratings: {
        bullet: { rating: 3200, progress: null },
        blitz: { rating: 3300, progress: null },
        rapid: { rating: null, progress: null },
      },
    });
  });
});

describe('checkAccount', () => {
  it('returns the name as the site writes it', async () => {
    const result = await checkAccount('lichess', ' someone ', {
      fetch: fakeFetch(200, lichessUser),
    });
    expect(result).toEqual({ ok: true, username: 'Someone' });
  });

  // Chess.com's API gives the username in lower case; the profile address keeps the case the
  // site shows (owner, 2026-11-15: "SomePlayer", not "someplayer").
  it('takes the Chess.com name with its case from the profile address', async () => {
    const result = await checkAccount('chesscom', 'someplayer', {
      fetch: fakeFetch(200, {
        username: 'someplayer',
        url: 'https://www.chess.com/member/SomePlayer',
      }),
    });
    expect(result).toEqual({ ok: true, username: 'SomePlayer' });
  });

  it('keeps the Chess.com name as typed when the profile gives no other case', async () => {
    const result = await checkAccount('chesscom', ' SomePlayer ', {
      fetch: fakeFetch(200, { username: 'someplayer' }),
    });
    expect(result).toEqual({ ok: true, username: 'SomePlayer' });
  });

  it('ignores a profile address that names someone else', async () => {
    const result = await checkAccount('chesscom', 'SomePlayer', {
      fetch: fakeFetch(200, { username: 'someplayer', url: 'https://www.chess.com/member/Other' }),
    });
    expect(result).toEqual({ ok: true, username: 'SomePlayer' });
  });

  it('says when the site has no such user', async () => {
    const result = await checkAccount('chesscom', 'nobody', { fetch: fakeFetch(404, '') });
    expect(result).toMatchObject({ ok: false, error: { code: 'user-not-found' } });
  });

  it('treats a closed Lichess account as not found', async () => {
    const result = await checkAccount('lichess', 'gone', {
      fetch: fakeFetch(200, { id: 'gone', username: 'gone', disabled: true }),
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'user-not-found' } });
  });
});
