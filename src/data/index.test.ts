import { describe, expect, it } from 'vitest';
import { createImportGames, importGames } from './index';

function recorder() {
  const calls: string[] = [];
  const fetchStub = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response('x', { status: 404 });
  }) as typeof fetch;
  return { calls, fetch: fetchStub };
}

describe('createImportGames', () => {
  it('sends a Lichess request to Lichess', async () => {
    const r = recorder();
    const result = await createImportGames({ fetch: r.fetch })({
      source: 'lichess',
      username: 'someone',
    });
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]).toContain('https://lichess.org/api/games/user/someone');
    expect(result).toMatchObject({ ok: false, error: { code: 'user-not-found' } });
  });

  it('sends a Chess.com request to Chess.com', async () => {
    const r = recorder();
    const result = await createImportGames({ fetch: r.fetch })({
      source: 'chesscom',
      username: 'Someone',
    });
    expect(r.calls).toEqual(['https://api.chess.com/pub/player/someone/games/archives']);
    expect(result).toMatchObject({ ok: false, error: { code: 'user-not-found' } });
  });

  it('parses pasted text without any request', async () => {
    const r = recorder();
    const result = await createImportGames({ fetch: r.fetch })({
      source: 'pgn',
      text: '1. e4 e5 *',
    });
    expect(r.calls).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it('passes the abort signal on', async () => {
    const r = recorder();
    const controller = new AbortController();
    controller.abort();
    const result = await createImportGames({ fetch: r.fetch })(
      { source: 'lichess', username: 'someone' },
      controller.signal,
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(r.calls).toHaveLength(0);
  });

  it('rejects an empty or whitespace username without a request', async () => {
    const r = recorder();
    const run = createImportGames({ fetch: r.fetch });
    for (const source of ['lichess', 'chesscom'] as const) {
      for (const username of ['', '   ']) {
        expect(await run({ source, username })).toMatchObject({
          ok: false,
          error: { code: 'user-not-found' },
        });
      }
    }
    expect(r.calls).toHaveLength(0);
  });

  it('exports a ready-made importGames', () => {
    expect(typeof importGames).toBe('function');
  });
});
