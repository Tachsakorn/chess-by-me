import { describe, expect, it } from 'vitest';
import { createGate, siteGet, RATE_LIMIT_PAUSE_MS } from './http';

/** A fetch whose answers the test releases by hand, recording what was asked and when. */
function heldFetch() {
  const asked: string[] = [];
  const pending: { url: string; answer(status: number, body?: string): void }[] = [];
  const doFetch = ((url: string, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      asked.push(String(url));
      init?.signal?.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      );
      pending.push({
        url: String(url),
        answer: (status, body = '{}') => resolve(new Response(body, { status })),
      });
    })) as unknown as typeof fetch;
  return { asked, pending, doFetch };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Fable review A4-01 and A4-04 (2026-11-15).
describe('siteGet', () => {
  it('sends one request at a time to a site, and does not hold up the other site', async () => {
    const { asked, pending, doFetch } = heldFetch();
    const options = { fetch: doFetch, gate: createGate() };
    const a = siteGet('https://lichess.org/api/user/a', null, options);
    const b = siteGet('https://lichess.org/api/user/b', null, options);
    const c = siteGet('https://api.chess.com/pub/player/c', null, options);
    await tick();
    expect(asked).toEqual(['https://lichess.org/api/user/a', 'https://api.chess.com/pub/player/c']);
    pending[0]!.answer(200);
    await a;
    await tick();
    expect(asked).toHaveLength(3);
    expect(asked[2]).toBe('https://lichess.org/api/user/b');
    pending[1]!.answer(200);
    pending[2]!.answer(200);
    expect((await b).ok && (await c).ok).toBe(true);
  });

  it('leaves a site alone for a minute after a 429, without touching the network', async () => {
    let clock = 1_000_000;
    const { asked, pending, doFetch } = heldFetch();
    const options = { fetch: doFetch, gate: createGate(() => clock) };
    const first = siteGet('https://lichess.org/api/user/a', null, options);
    await tick();
    pending[0]!.answer(429);
    expect(await first).toEqual({ ok: false, error: { code: 'rate-limited', detail: 'HTTP 429' } });

    clock += RATE_LIMIT_PAUSE_MS - 1;
    const during = await siteGet('https://lichess.org/api/user/b', null, options);
    expect(during.ok ? null : during.error.code).toBe('rate-limited');
    expect(asked).toHaveLength(1);

    clock += 2;
    const after = siteGet('https://lichess.org/api/user/c', null, options);
    await tick();
    expect(asked).toHaveLength(2);
    pending[1]!.answer(200);
    expect((await after).ok).toBe(true);
  });

  it('gives up after the time limit with a network error', async () => {
    const { doFetch } = heldFetch();
    const got = await siteGet('https://api.chess.com/pub/player/x', null, {
      fetch: doFetch,
      gate: createGate(),
      timeoutMs: 20,
    });
    expect(got).toEqual({
      ok: false,
      error: { code: 'network', detail: 'no answer within 20 ms' },
    });
  });

  it('never starts a request cancelled while it waited its turn', async () => {
    const { asked, pending, doFetch } = heldFetch();
    const gate = createGate();
    const first = siteGet('https://lichess.org/a', null, { fetch: doFetch, gate });
    const stop = new AbortController();
    const second = siteGet('https://lichess.org/b', null, {
      fetch: doFetch,
      gate,
      signal: stop.signal,
    });
    stop.abort();
    await tick();
    pending[0]!.answer(200);
    await first;
    expect(await second).toEqual({ ok: false, error: { code: 'cancelled', detail: null } });
    expect(asked).toEqual(['https://lichess.org/a']);
  });
});
