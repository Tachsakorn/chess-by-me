/**
 * Every request to Lichess and Chess.com goes through here (Fable review A4-01, A4-04):
 *
 * - One request at a time per site. Lichess asks for it ("Only make one request at a time",
 *   https://lichess.org/page/api-tips); Chess.com answers parallel requests with 429.
 * - After a 429 the site is left alone for 60 seconds ("waiting one minute before retrying will be
 *   sufficient", same page): requests in that time fail at once with `rate-limited`, without
 *   reaching the network.
 * - Every request gives up after 15 seconds (body included), so a connection that never answers
 *   does not leave a screen waiting for ever.
 * - A request whose signal is aborted while it waits its turn never starts.
 *
 * Browsers cannot set a User-Agent; see docs/sources/import.md for what Lichess asks of apps.
 */
import type { ImportError } from '@/contract';

export type Site = 'lichess' | 'chesscom';

export const REQUEST_TIMEOUT_MS = 15_000;
export const RATE_LIMIT_PAUSE_MS = 60_000;

/** The one-at-a-time line and the 429 pause of each site. One per app; tests make their own. */
export interface Gate {
  /** Runs `task` when the earlier requests to `site` are done. */
  run<T>(site: Site, task: () => Promise<T>): Promise<T>;
  /** Until when (ms since 1970) the site is left alone after a 429; 0 when it is not. */
  pausedUntil(site: Site): number;
  pause(site: Site): void;
}

export function createGate(now: () => number = Date.now): Gate {
  const lines: Record<Site, Promise<unknown>> = {
    lichess: Promise.resolve(),
    chesscom: Promise.resolve(),
  };
  const paused: Record<Site, number> = { lichess: 0, chesscom: 0 };
  return {
    run(site, task) {
      const turn = lines[site].then(task, task);
      lines[site] = turn.catch(() => {});
      return turn;
    },
    pausedUntil(site) {
      return paused[site] > now() ? paused[site] : 0;
    },
    pause(site) {
      paused[site] = now() + RATE_LIMIT_PAUSE_MS;
    },
  };
}

const appGate = createGate();

export interface FetchOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** The app shares one; a call that passes its own `fetch` gets a fresh one unless given. */
  gate?: Gate;
  /** Default REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
  /**
   * The browser's HTTP cache mode. Chess.com uses `no-cache`: the browser keeps its copy and asks
   * the site whether it changed (ETag), so an unchanged month comes back as an empty 304.
   */
  cache?: RequestCache;
}

/** An answer from the site (any status), or why there was none. */
export type Got = { ok: true; status: number; text: string } | { ok: false; error: ImportError };

function siteOf(url: string): Site {
  return new URL(url).hostname.endsWith('chess.com') ? 'chesscom' : 'lichess';
}

const isAbortError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';

/** GETs `url` in its site's line and reads the whole body as text. */
export async function siteGet(
  url: string,
  accept: string | null,
  options: FetchOptions = {},
): Promise<Got> {
  const site = siteOf(url);
  // A request with its own fetch (a test) gets its own line unless it brings one.
  const gate = options.gate ?? (options.fetch ? createGate() : appGate);
  const doFetch = options.fetch ?? fetch;
  const outer = options.signal;
  const cancelled: Got = { ok: false, error: { code: 'cancelled', detail: null } };
  const limited: Got = {
    ok: false,
    error: { code: 'rate-limited', detail: 'waiting after a 429' },
  };
  if (outer?.aborted) return cancelled;
  if (gate.pausedUntil(site) > 0) return limited;

  return gate.run(site, async (): Promise<Got> => {
    if (outer?.aborted) return cancelled;
    if (gate.pausedUntil(site) > 0) return limited;
    const controller = new AbortController();
    let timedOut = false;
    const limit = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, limit);
    const forward = () => controller.abort();
    outer?.addEventListener('abort', forward);
    try {
      const res = await doFetch(url, {
        ...(accept ? { headers: { Accept: accept } } : {}),
        ...(options.cache ? { cache: options.cache } : {}),
        signal: controller.signal,
      });
      if (res.status === 429) {
        gate.pause(site);
        return { ok: false, error: { code: 'rate-limited', detail: 'HTTP 429' } };
      }
      return { ok: true, status: res.status, text: await res.text() };
    } catch (error) {
      if (timedOut) {
        return { ok: false, error: { code: 'network', detail: `no answer within ${limit} ms` } };
      }
      if (outer?.aborted || isAbortError(error)) return cancelled;
      return {
        ok: false,
        error: { code: 'network', detail: error instanceof Error ? error.message : String(error) },
      };
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', forward);
    }
  });
}

/** `siteGet`, with a 2xx body read as JSON (null for other statuses); an unreadable body counts
 *  as the site failing. */
export async function siteGetJson<T>(
  url: string,
  options: FetchOptions = {},
): Promise<{ ok: true; status: number; body: T | null } | { ok: false; error: ImportError }> {
  const got = await siteGet(url, 'application/json', options);
  if (!got.ok) return got;
  // Only a 2xx answer has a body worth reading; the caller decides what the status means.
  if (got.status < 200 || got.status > 299) return { ok: true, status: got.status, body: null };
  try {
    return { ok: true, status: got.status, body: JSON.parse(got.text) as T };
  } catch {
    return { ok: false, error: { code: 'source-unavailable', detail: 'unreadable answer' } };
  }
}
