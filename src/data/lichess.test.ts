import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fetchLichessGames } from './lichess';

const ndjson = readFileSync(
  fileURLToPath(new URL('./__fixtures__/lichess-user.ndjson', import.meta.url)),
  'utf8',
);
const lines = ndjson.trim().split('\n');

type Call = { url: string; init: RequestInit | undefined };

function stub(response: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return response();
  }) as typeof fetch;
  return { fetch: fetchStub, calls };
}

const ok = (body: string) => () => new Response(body, { status: 200 });

describe('fetchLichessGames', () => {
  it('requests the export URL with the NDJSON accept header, trimming and encoding the name', async () => {
    const s = stub(ok(ndjson));
    await fetchLichessGames(' Eric Rosen ', { fetch: s.fetch });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.url).toBe(
      'https://lichess.org/api/games/user/Eric%20Rosen?max=50&pgnInJson=true&clocks=true&opening=true',
    );
    const headers = new Headers(s.calls[0]!.init?.headers);
    expect(headers.get('accept')).toBe('application/x-ndjson');
  });

  it('passes max through', async () => {
    const s = stub(ok(ndjson));
    await fetchLichessGames('EricRosen', { fetch: s.fetch, max: 5 });
    expect(s.calls[0]!.url).toContain('max=5&');
  });

  it('returns the recorded games newest first with ids, urls, dates and ratings', async () => {
    const s = stub(ok(ndjson));
    const r = await fetchLichessGames('EricRosen', { fetch: s.fetch });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.games).toHaveLength(5);
    expect(r.skipped).toBe(0);
    const raw = lines.map((l) => JSON.parse(l));
    expect(r.games.map((g) => g.id)).toEqual(raw.map((j) => `lichess:${j.id}`));
    const times = r.games.map((g) => g.playedAt!);
    expect([...times].sort().reverse()).toEqual(times);
    const first = r.games[0]!;
    const j = raw[0];
    expect(first.source).toBe('lichess');
    expect(first.sourceUrl).toBe(`https://lichess.org/${j.id}`);
    expect(first.playedAt).toBe(new Date(j.createdAt).toISOString().replace(/\.\d{3}Z$/, 'Z'));
    expect(first.rated).toBe(j.rated);
    expect(first.white).toMatchObject({
      name: 'EricRosen',
      rating: j.players.white.rating,
      title: 'IM',
    });
    expect(first.black.rating).toBe(j.players.black.rating);
    expect(first.moves.length).toBeGreaterThan(0);
    expect(first.timeControl).toMatchObject({ raw: '60+0', timeClass: 'bullet' });
  });

  it('maps Lichess status to termination', async () => {
    const s = stub(ok(ndjson));
    const r = await fetchLichessGames('EricRosen', { fetch: s.fetch });
    if (!r.ok) throw new Error('expected ok');
    const byId = new Map(r.games.map((g) => [g.id, g]));
    const raw = lines.map((l) => JSON.parse(l));
    const resign = raw.find((j) => j.status === 'resign')!;
    expect(byId.get(`lichess:${resign.id}`)!.termination).toBe('resignation');
    const mate = raw.find((j) => j.status === 'mate')!;
    expect(byId.get(`lichess:${mate.id}`)!.termination).toBe('checkmate');
  });

  it('reads a clock ending with no winner as timeout against insufficient material', async () => {
    // Hand-made variation of a real recorded drawn line: only the status field is changed.
    const drawn = JSON.parse(lines.find((l) => JSON.parse(l).status === 'draw')!);
    expect(drawn.winner).toBeUndefined();
    const flagged = JSON.stringify({ ...drawn, status: 'outoftime' });
    const r = await fetchLichessGames('EricRosen', { fetch: stub(ok(flagged)).fetch });
    if (!r.ok) throw new Error('expected ok');
    expect(r.games[0]!.termination).toBe('timeout-vs-insufficient-material');
  });

  it('reads a clock ending with a winner as timeout', async () => {
    // Hand-made variation of a real recorded decisive line: only the status field is changed.
    const won = JSON.parse(lines.find((l) => JSON.parse(l).status === 'resign')!);
    const flagged = JSON.stringify({ ...won, status: 'outoftime' });
    const r = await fetchLichessGames('EricRosen', { fetch: stub(ok(flagged)).fetch });
    if (!r.ok) throw new Error('expected ok');
    expect(r.games[0]!.termination).toBe('timeout');
  });

  it('skips and counts non-standard variants', async () => {
    // Hand-made variation of a real recorded line: only the variant field is changed.
    const variant = JSON.stringify({
      ...JSON.parse(lines[0]!),
      id: 'variant1',
      variant: 'chess960',
    });
    const s = stub(ok(`${variant}\n${ndjson}`));
    const r = await fetchLichessGames('EricRosen', { fetch: s.fetch });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.games).toHaveLength(5);
      expect(r.skipped).toBe(1);
    }
  });

  it('maps HTTP statuses to error codes', async () => {
    for (const [status, code] of [
      [404, 'user-not-found'],
      [429, 'rate-limited'],
      [500, 'source-unavailable'],
      [503, 'source-unavailable'],
    ] as const) {
      const s = stub(() => new Response('x', { status }));
      const r = await fetchLichessGames('EricRosen', { fetch: s.fetch });
      expect(r).toMatchObject({ ok: false, error: { code } });
    }
  });

  it('maps a rejecting fetch to network and an abort to cancelled', async () => {
    const net = await fetchLichessGames('x', {
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as typeof fetch,
    });
    expect(net).toMatchObject({ ok: false, error: { code: 'network' } });

    const abort = await fetchLichessGames('x', {
      fetch: (async () => {
        throw new DOMException('aborted', 'AbortError');
      }) as typeof fetch,
    });
    expect(abort).toMatchObject({ ok: false, error: { code: 'cancelled' } });

    const controller = new AbortController();
    controller.abort();
    const pre = await fetchLichessGames('x', {
      fetch: stub(ok(ndjson)).fetch,
      signal: controller.signal,
    });
    expect(pre).toMatchObject({ ok: false, error: { code: 'cancelled' } });
  });

  // Fable review A4-01: an app that holds the newer games asks only for those.
  it('asks only for games since a given time when told', async () => {
    const s = stub(ok(ndjson));
    await fetchLichessGames('EricRosen', { fetch: s.fetch, since: 1763200000123.7 });
    expect(s.calls[0]!.url).toBe(
      'https://lichess.org/api/games/user/EricRosen?max=50&since=1763200000123&pgnInJson=true&clocks=true&opening=true',
    );
  });

  it('reports no-games for an empty body', async () => {
    const r = await fetchLichessGames('x', { fetch: stub(ok('')).fetch });
    expect(r).toMatchObject({ ok: false, error: { code: 'no-games' } });
  });
});
