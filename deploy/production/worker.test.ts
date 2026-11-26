import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JavaScript run by Cloudflare, no type declarations
import worker from './worker.js';

type Fetch = (
  request: Request,
  env: { ASSETS: { fetch(request: Request): Promise<Response> } },
) => Promise<Response>;
const handle = (worker as { fetch: Fetch }).fetch;

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=31536000, immutable, no-transform',
  'Content-Security-Policy': "default-src 'self'",
  'X-Content-Type-Options': 'nosniff',
};

/** env.ASSETS as Cloudflare serves it: the file when there is one, else the app's page (200). */
function assets(files: Record<string, { type: string; body: string }>) {
  const asked: string[] = [];
  return {
    asked,
    env: {
      ASSETS: {
        fetch(request: Request): Promise<Response> {
          const path = new URL(request.url).pathname;
          asked.push(path);
          const file = files[path];
          return Promise.resolve(
            file
              ? new Response(file.body, {
                  status: 200,
                  headers: { ...PAGE_HEADERS, 'Content-Type': file.type },
                })
              : new Response('<!doctype html><title>Chess by me</title>', {
                  status: 200,
                  headers: PAGE_HEADERS,
                }),
          );
        },
      },
    },
  };
}

const files = {
  '/assets/index-abc.js': { type: 'text/javascript', body: 'console.log(1)' },
  '/engines/stockfish-17.1-lite-single-03e3232.wasm': { type: 'application/wasm', body: 'wasm' },
};

describe('worker.js', () => {
  it('sends www.chessby.me to chessby.me, same path and query', async () => {
    const { env, asked } = assets(files);
    const response = await handle(new Request('https://www.chessby.me/review/x?a=1'), env);
    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('https://chessby.me/review/x?a=1');
    expect(asked).toEqual([]);
  });

  it('serves files and app addresses as they are', async () => {
    const { env } = assets(files);
    const script = await handle(new Request('https://chessby.me/assets/index-abc.js'), env);
    expect(script.status).toBe(200);
    expect(await script.text()).toBe('console.log(1)');
    const wasm = await handle(
      new Request('https://chessby.me/engines/stockfish-17.1-lite-single-03e3232.wasm'),
      env,
    );
    expect(wasm.headers.get('Content-Type')).toBe('application/wasm');
    const page = await handle(new Request('https://chessby.me/review/lichess%3Aabc'), env);
    expect(page.status).toBe(200);
    expect(page.headers.get('Content-Type')).toContain('text/html');
  });

  // 1.2: the short game addresses are app addresses, answered with the page (the app reads them).
  it.each([
    'https://chessby.me/lichess/LAGvRNey',
    'https://chessby.me/chesscom/188816899405',
    'https://chessby.me/chesscom/daily/747757185?username=erik',
  ])('serves the app for %s', async (url) => {
    const { env, asked } = assets(files);
    const response = await handle(new Request(url), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(asked).toEqual([new URL(url).pathname]);
  });

  it('sends www to the same short address', async () => {
    const { env } = assets(files);
    const response = await handle(new Request('https://www.chessby.me/chesscom/1?username=a'), env);
    expect(response.headers.get('Location')).toBe('https://chessby.me/chesscom/1?username=a');
  });

  // Fable review 1.1 B1-01: a missing script was answered with the page, 200, kept for a year.
  it.each([
    'https://chessby.me/assets/does-not-exist.js',
    'https://chessby.me/assets/openings-OLD.js',
    'https://chessby.me/engines/stockfish-17.1-single-1234567.wasm',
    'https://preview.chessbyme.workers.dev/assets/nope.css',
  ])('answers %s with 404, never kept, instead of the page', async (url) => {
    const { env } = assets(files);
    const response = await handle(new Request(url), env);
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).not.toContain('text/html');
    // The security headers of the site stay.
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'self'");
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
