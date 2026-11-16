import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCloudEval } from './cloudEval';

// Real responses; see __fixtures__/README.md for how each was recorded.
const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
const AFTER_E4_BODY = fixture('cloud-eval-after-e4.json');
const RUY_BODY = fixture('cloud-eval-ruy-lopez-castling.json');
const FOOLS_MATE_BODY = fixture('cloud-eval-fools-mate.json');
const NOT_FOUND_BODY = fixture('cloud-eval-not-found.json');

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const RUY = 'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 5';
const FOOLS_MATE = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';
const OBSCURE = 'r5k1/4R3/1p1r3p/p1p3p1/3p1p2/3P1P2/PP1B1KP1/2R5 w - - 0 31';

type FetchArgs = Parameters<typeof fetch>;

/** A fetch that answers every request with the given body and status, and records its calls. */
function answering(body: string, status = 200) {
  const calls: FetchArgs[] = [];
  const stub: typeof fetch = (...args) => {
    calls.push(args);
    return Promise.resolve(new Response(body, { status }));
  };
  return { stub, calls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchCloudEval, the request', () => {
  it('asks the cloud-eval endpoint with the FEN percent-encoded and the number of lines', async () => {
    const { stub, calls } = answering(AFTER_E4_BODY);
    await fetchCloudEval(AFTER_E4, { multiPv: 2, minDepth: 16, fetch: stub });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe(
      'https://lichess.org/api/cloud-eval?fen=rnbqkbnr%2Fpppppppp%2F8%2F8%2F4P3%2F8%2FPPPP1PPP%2FRNBQKBNR%20b%20KQkq%20-%200%201&multiPv=2',
    );
  });

  it('sends no custom headers, so a browser needs no CORS preflight', async () => {
    const { stub, calls } = answering(AFTER_E4_BODY);
    await fetchCloudEval(AFTER_E4, { multiPv: 2, minDepth: 16, fetch: stub });
    const init = calls[0]?.[1];
    expect(init?.headers).toBeUndefined();
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('fetchCloudEval, a hit', () => {
  it('maps a response to lines ranked 1..n with White-relative scores left as they are', async () => {
    const { stub } = answering(AFTER_E4_BODY);
    const result = await fetchCloudEval(AFTER_E4, { multiPv: 2, minDepth: 16, fetch: stub });
    // Black is to move here; the recorded cp values (+22, +27) are already White's view.
    expect(result).toEqual({
      depth: 60,
      lines: [
        {
          rank: 1,
          score: { kind: 'cp', value: 22 },
          uci: 'e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 f1e1 e4d6 f3e5'.split(' '),
        },
        {
          rank: 2,
          score: { kind: 'cp', value: 27 },
          uci: 'c7c6 d2d4 d7d5 e4e5 c6c5 g1f3 c5d4 f3d4 b8c6 d4c6'.split(' '),
        },
      ],
    });
  });

  it('rewrites castling written as king takes rook (e1h1, e8h8) to e1g1 and e8g8', async () => {
    // What Lichess sent: the first line starts with e1h1 and the second holds e8h8.
    const recorded = JSON.parse(RUY_BODY) as { pvs: Array<{ moves: string }> };
    expect(recorded.pvs[0]?.moves.startsWith('e1h1 ')).toBe(true);
    expect(recorded.pvs[1]?.moves).toContain(' e8h8 ');
    const { stub } = answering(RUY_BODY);
    const result = await fetchCloudEval(RUY, { multiPv: 2, minDepth: 16, fetch: stub });
    expect(result?.lines[0]?.uci).toEqual(
      'e1g1 f6e4 d2d4 b7b5 a4b3 d7d5 d4e5 c8e6 b1d2 e4c5'.split(' '),
    );
    expect(result?.lines[1]?.uci).toEqual(
      'd2d3 f8c5 c2c3 b7b5 a4b3 d7d6 b1d2 e8g8 d2f1 d6d5'.split(' '),
    );
  });

  it('reads a mate value as White-relative: negative means Black mates', async () => {
    const { stub } = answering(FOOLS_MATE_BODY);
    const result = await fetchCloudEval(FOOLS_MATE, { multiPv: 2, minDepth: 16, fetch: stub });
    expect(result?.lines).toEqual([
      { rank: 1, score: { kind: 'mate', moves: 1, winner: 'black' }, uci: ['d8h4'] },
      {
        rank: 2,
        score: { kind: 'cp', value: -236 },
        uci: 'h7h5 g4g5 d8g5 f1h3 g5h4 e1f1 b8c6 b1c3 g8e7 d2d3'.split(' '),
      },
    ]);
  });

  it('reads a positive mate value as White mating', async () => {
    // Hand-built body (same shape as the recorded ones): White to move, Ra8 mates.
    const { stub } = answering(
      JSON.stringify({ fen: '', knodes: 1, depth: 30, pvs: [{ moves: 'a1a8', mate: 1 }] }),
    );
    const result = await fetchCloudEval('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', {
      multiPv: 1,
      minDepth: 16,
      fetch: stub,
    });
    expect(result?.lines[0]?.score).toEqual({ kind: 'mate', moves: 1, winner: 'white' });
  });

  it('keeps only as many lines as were asked for', async () => {
    const { stub } = answering(AFTER_E4_BODY);
    const result = await fetchCloudEval(AFTER_E4, { multiPv: 1, minDepth: 16, fetch: stub });
    expect(result?.lines.map((line) => line.rank)).toEqual([1]);
  });

  it('accepts a response exactly at the minimum depth', async () => {
    const { stub } = answering(AFTER_E4_BODY);
    const result = await fetchCloudEval(AFTER_E4, { multiPv: 2, minDepth: 60, fetch: stub });
    expect(result?.depth).toBe(60);
  });

  it('accepts one line for a position with one legal move when two were asked for', async () => {
    // Hand-built body: the position has a single legal move (Nf1), so one line is all there can be.
    const { stub } = answering(
      JSON.stringify({ fen: '', knodes: 1, depth: 30, pvs: [{ moves: 'd2f1 e1e2', cp: -280 }] }),
    );
    const result = await fetchCloudEval('4k3/8/8/8/8/8/3N1PPP/4r1K1 w - - 0 1', {
      multiPv: 2,
      minDepth: 16,
      fetch: stub,
    });
    expect(result?.lines).toEqual([
      { rank: 1, score: { kind: 'cp', value: -280 }, uci: ['d2f1', 'e1e2'] },
    ]);
  });
});

describe('fetchCloudEval, a miss is null and never an error', () => {
  it('returns null for 404 (no evaluation for the position)', async () => {
    const { stub } = answering(NOT_FOUND_BODY, 404);
    expect(await fetchCloudEval(OBSCURE, { multiPv: 2, minDepth: 16, fetch: stub })).toBeNull();
  });

  it('returns null for 429 (rate limited)', async () => {
    const { stub } = answering('', 429);
    expect(await fetchCloudEval(AFTER_E4, { multiPv: 2, minDepth: 16, fetch: stub })).toBeNull();
  });

  it('returns null for a server error, even when a body is present', async () => {
    const { stub } = answering(AFTER_E4_BODY, 500);
    expect(await fetchCloudEval(AFTER_E4, { multiPv: 2, minDepth: 16, fetch: stub })).toBeNull();
  });

  it('returns null when the depth is below the minimum', async () => {
    const { stub } = answering(AFTER_E4_BODY);
    expect(await fetchCloudEval(AFTER_E4, { multiPv: 2, minDepth: 61, fetch: stub })).toBeNull();
  });

  it('returns null when fetch rejects', async () => {
    const stub: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await fetchCloudEval(AFTER_E4, { multiPv: 2, minDepth: 16, fetch: stub })).toBeNull();
  });

  it('returns null when fetch throws synchronously', async () => {
    const stub: typeof fetch = () => {
      throw new Error('boom');
    };
    expect(await fetchCloudEval(AFTER_E4, { multiPv: 2, minDepth: 16, fetch: stub })).toBeNull();
  });

  it('returns null after timeoutMs when fetch never answers, and aborts the request', async () => {
    let seen: AbortSignal | null | undefined;
    const stub: typeof fetch = (_input, init) => {
      seen = init?.signal;
      return new Promise<Response>(() => {});
    };
    vi.useFakeTimers();
    let outcome: unknown = 'pending';
    void fetchCloudEval(AFTER_E4, {
      multiPv: 2,
      minDepth: 16,
      timeoutMs: 30,
      fetch: stub,
    }).then((value) => {
      outcome = value;
    });
    await vi.advanceTimersByTimeAsync(29);
    expect(outcome).toBe('pending');
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBeNull();
    expect(seen?.aborted).toBe(true);
  });

  it('waits 1500 ms by default', async () => {
    vi.useFakeTimers();
    const stub: typeof fetch = () => new Promise<Response>(() => {});
    let outcome: unknown = 'pending';
    void fetchCloudEval(AFTER_E4, { multiPv: 2, minDepth: 16, fetch: stub }).then((value) => {
      outcome = value;
    });
    await vi.advanceTimersByTimeAsync(1499);
    expect(outcome).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBeNull();
  });

  it('returns null when the body never arrives within the timeout', async () => {
    const stalled = {
      ok: true,
      status: 200,
      text: () => new Promise<string>(() => {}),
      json: () => new Promise<unknown>(() => {}),
    } as unknown as Response;
    const stub: typeof fetch = () => Promise.resolve(stalled);
    const result = await fetchCloudEval(AFTER_E4, {
      multiPv: 2,
      minDepth: 16,
      timeoutMs: 30,
      fetch: stub,
    });
    expect(result).toBeNull();
  });

  it('returns null without calling fetch when the signal is already aborted', async () => {
    const { stub, calls } = answering(AFTER_E4_BODY);
    const controller = new AbortController();
    controller.abort();
    const result = await fetchCloudEval(AFTER_E4, {
      multiPv: 2,
      minDepth: 16,
      fetch: stub,
      signal: controller.signal,
    });
    expect(result).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('returns null at once when the signal aborts while the request is in flight', async () => {
    let seen: AbortSignal | null | undefined;
    const stub: typeof fetch = (_input, init) => {
      seen = init?.signal;
      return new Promise<Response>(() => {});
    };
    const controller = new AbortController();
    const pending = fetchCloudEval(AFTER_E4, {
      multiPv: 2,
      minDepth: 16,
      timeoutMs: 60_000,
      fetch: stub,
      signal: controller.signal,
    });
    controller.abort();
    expect(await pending).toBeNull();
    expect(seen?.aborted).toBe(true);
  });

  it('returns null for a body that is not the expected JSON', async () => {
    const bodies = [
      'not json',
      'null',
      '{}',
      JSON.stringify({ depth: 40, pvs: [] }),
      JSON.stringify({ depth: 40, pvs: 'e7e5' }),
      JSON.stringify({ depth: '40', pvs: [{ moves: 'e7e5', cp: 20 }] }),
      JSON.stringify({ depth: 40, pvs: [{ moves: 'e7e5' }] }),
      JSON.stringify({ depth: 40, pvs: [{ moves: 'e7e5', cp: '20' }] }),
      JSON.stringify({ depth: 40, pvs: [{ moves: 'e7e5', mate: 0 }] }),
      JSON.stringify({ depth: 40, pvs: [{ moves: 7, cp: 20 }] }),
      JSON.stringify({ depth: 40, pvs: [null] }),
    ];
    for (const body of bodies) {
      const { stub } = answering(body);
      const result = await fetchCloudEval(AFTER_E4, { multiPv: 1, minDepth: 16, fetch: stub });
      expect(result, body).toBeNull();
    }
  });

  it('returns null when the first move of a line is not legal in the position asked about', async () => {
    // The recorded answer for the position after 1. e4, offered for the starting position.
    const { stub } = answering(AFTER_E4_BODY);
    expect(await fetchCloudEval(START, { multiPv: 2, minDepth: 16, fetch: stub })).toBeNull();
  });

  it('returns null when fewer lines come back than asked for and more moves were possible', async () => {
    // The recorded response with its second line removed.
    const body = JSON.parse(AFTER_E4_BODY) as { pvs: unknown[] };
    body.pvs = body.pvs.slice(0, 1);
    const { stub } = answering(JSON.stringify(body));
    expect(await fetchCloudEval(AFTER_E4, { multiPv: 2, minDepth: 16, fetch: stub })).toBeNull();
  });

  it('returns null for a FEN that is not a position', async () => {
    const { stub } = answering(AFTER_E4_BODY);
    expect(await fetchCloudEval('nonsense', { multiPv: 2, minDepth: 16, fetch: stub })).toBeNull();
  });
});
