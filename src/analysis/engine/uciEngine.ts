import { EngineError } from './errors';
import type { EngineTransport } from './transport';
import { parseInfo, type UciScore } from './uci';

/**
 * What one search found, exactly as the engine reported it: scores are from the
 * point of view of the side to move. Lines are ordered rank 1 first and there
 * is always at least rank 1.
 */
export interface RawEval {
  depth: number;
  lines: Array<{ rank: number; score: UciScore; pv: string[] }>;
}

const DEFAULT_START_TIMEOUT_MS = 30_000;

/** Whoever is currently waiting for engine output. At most one at a time. */
interface Listener {
  line(line: string): void;
  /** The engine failed or was closed while this listener was waiting. */
  end(error: EngineError): void;
}

type State = 'new' | 'starting' | 'ready' | 'failed' | 'closed';

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

/**
 * The result of a finished search: the lines of the deepest depth for which
 * rank 1 was reported. A rank that was not reported at that depth is left out
 * rather than filled in from a shallower depth, so every line of a result
 * comes from the same depth. Null when nothing usable was reported.
 */
function deepest(reports: Map<number, Map<number, { score: UciScore; pv: string[] }>>) {
  let depth = -1;
  let ranks: Map<number, { score: UciScore; pv: string[] }> | null = null;
  for (const [reportedDepth, reportedRanks] of reports) {
    if (reportedDepth > depth && reportedRanks.has(1)) {
      depth = reportedDepth;
      ranks = reportedRanks;
    }
  }
  if (ranks === null) return null;
  const lines = [...ranks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rank, report]) => ({ rank, score: report.score, pv: report.pv }));
  return { depth, lines } satisfies RawEval;
}

/**
 * Talks UCI to one engine over a transport.
 *
 * - `start` must finish before anything else is asked.
 * - Searches run strictly one after the other, in the order `evaluate` was
 *   called; the next command is only sent once the previous search has
 *   answered `bestmove`, so output of one search can never be read as another's.
 * - Nothing is remembered between searches: every result is built only from
 *   the `info` lines that arrived between its own `go` and its own `bestmove`.
 * - Every rejection is an `EngineError` (except a `RangeError` for a bad
 *   argument). After `engine-load-failed` or a transport failure the engine is
 *   unusable and every later call rejects with the same error; the caller
 *   should `close()` it.
 */
export class UciEngine {
  private readonly transport: EngineTransport;
  private readonly startTimeoutMs: number;
  private state: State = 'new';
  /** Why the engine is unusable; set when `state` is `failed`. */
  private failure: EngineError | null = null;
  private listener: Listener | null = null;
  /** Tail of the chain of queued work; never rejects. */
  private queue: Promise<void> = Promise.resolve();
  /** Those waiting for the next `readyok` of `ping`. */
  private pings: Array<() => void> = [];

  constructor(transport: EngineTransport, options: { startTimeoutMs?: number } = {}) {
    this.transport = transport;
    this.startTimeoutMs = options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
    transport.onLine((raw) => {
      const line = raw.trim();
      if (line === 'readyok' && this.pings.length > 0) {
        const waiting = this.pings;
        this.pings = [];
        for (const answered of waiting) answered();
      }
      this.listener?.line(line);
    });
    transport.onError((detail) => {
      if (this.state === 'closed' || this.state === 'failed') return;
      // Before the handshake is done the engine has not loaded; after it, it crashed.
      this.fail(
        new EngineError(this.state === 'ready' ? 'engine-crashed' : 'engine-load-failed', detail),
      );
    });
  }

  /**
   * Handshake: `uci` → `uciok`, then `setoption name MultiPV` (and `Hash` when given),
   * `isready` →
   * `readyok`. Rejects with `engine-load-failed` if the transport fails or the
   * whole handshake takes longer than `startTimeoutMs` (30 s by default).
   */
  start(options: { multiPv: number; hashMb?: number }): Promise<void> {
    if (!isPositiveInteger(options.multiPv)) {
      return Promise.reject(new RangeError(`multiPv must be a positive whole number`));
    }
    if (options.hashMb !== undefined && !isPositiveInteger(options.hashMb)) {
      return Promise.reject(new RangeError(`hashMb must be a positive whole number`));
    }
    if (this.state !== 'new') {
      return Promise.reject(
        this.unusable() ?? new EngineError('engine-load-failed', 'start called more than once'),
      );
    }
    this.state = 'starting';
    return new Promise<void>((resolve, reject) => {
      let awaiting: 'uciok' | 'readyok' = 'uciok';
      const timer = setTimeout(() => {
        this.fail(
          new EngineError(
            'engine-load-failed',
            `no ${awaiting} from the engine within ${this.startTimeoutMs} ms`,
          ),
        );
      }, this.startTimeoutMs);
      this.listener = {
        line: (line) => {
          if (line !== awaiting) return;
          if (awaiting === 'uciok') {
            awaiting = 'readyok';
            this.transport.send(`setoption name MultiPV value ${options.multiPv}`);
            if (options.hashMb !== undefined) {
              this.transport.send(`setoption name Hash value ${options.hashMb}`);
            }
            this.transport.send('isready');
            return;
          }
          clearTimeout(timer);
          this.listener = null;
          this.state = 'ready';
          resolve();
        },
        end: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.transport.send('uci');
    });
  }

  /**
   * Searches one position to a fixed depth. Scores in the result are from the
   * side to move. Aborting `signal` sends `stop`; the promise then rejects with
   * `cancelled` once the engine has answered `bestmove`, which leaves the engine
   * ready for the next search.
   */
  evaluate(fen: string, depth: number, signal?: AbortSignal): Promise<RawEval> {
    if (!isPositiveInteger(depth)) {
      return Promise.reject(new RangeError(`depth must be a positive whole number`));
    }
    return this.enqueue(() => this.search(fen, depth, signal));
  }

  /**
   * Tells the engine that the next position belongs to a different game
   * (`ucinewgame`, then `isready` → `readyok` as the protocol asks). Queued like
   * a search: it runs after the searches already requested.
   */
  newGame(): void {
    void this.enqueue(() => this.reset());
  }

  /**
   * Whether the engine still answers (1.1.1, Fable review 1.1 B2-03): `isready` is sent at once,
   * not queued, and Stockfish answers `readyok` even in the middle of a search. False when no
   * answer comes within `waitMs`, or the engine failed or was closed. The search under way is not
   * disturbed: a stray `readyok` is no line of a search.
   */
  ping(waitMs: number): Promise<boolean> {
    if (this.state !== 'ready') return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined = undefined;
      const answered = () => {
        clearTimeout(timer);
        resolve(this.state === 'ready');
      };
      timer = setTimeout(() => {
        this.pings = this.pings.filter((waiting) => waiting !== answered);
        resolve(false);
      }, waitMs);
      this.pings.push(answered);
      this.transport.send('isready');
    });
  }

  /** Ends the engine. A pending `start` or search rejects with `cancelled`. */
  close(): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.endListener(new EngineError('cancelled', 'engine closed'));
    this.transport.close();
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** The error every call gets while the engine cannot be used; null when it is ready. */
  private unusable(): EngineError | null {
    switch (this.state) {
      case 'ready':
        return null;
      case 'failed':
        return this.failure ?? new EngineError('engine-crashed');
      case 'closed':
        return new EngineError('cancelled', 'engine closed');
      case 'new':
      case 'starting':
        return new EngineError('engine-load-failed', 'the engine has not finished starting');
    }
  }

  private fail(error: EngineError): void {
    this.state = 'failed';
    this.failure = error;
    this.endListener(error);
  }

  private endListener(error: EngineError): void {
    const listener = this.listener;
    this.listener = null;
    listener?.end(error);
  }

  private search(fen: string, depth: number, signal?: AbortSignal): Promise<RawEval> {
    const unusable = this.unusable();
    if (unusable) return Promise.reject(unusable);
    if (signal?.aborted) return Promise.reject(new EngineError('cancelled'));

    return new Promise<RawEval>((resolve, reject) => {
      const reports = new Map<number, Map<number, { score: UciScore; pv: string[] }>>();
      let stopping = false;
      const onAbort = () => {
        stopping = true;
        this.transport.send('stop');
      };

      this.listener = {
        line: (line) => {
          const info = parseInfo(line);
          if (info) {
            let ranks = reports.get(info.depth);
            if (!ranks) {
              ranks = new Map();
              reports.set(info.depth, ranks);
            }
            ranks.set(info.multiPv, { score: info.score, pv: info.pv });
            return;
          }
          if (line !== 'bestmove' && !line.startsWith('bestmove ')) return;

          signal?.removeEventListener('abort', onAbort);
          this.listener = null;
          if (stopping) {
            reject(new EngineError('cancelled'));
            return;
          }
          const result = deepest(reports);
          if (result) resolve(result);
          else {
            reject(
              new EngineError(
                'engine-crashed',
                `the search of "${fen}" ended without an evaluation`,
              ),
            );
          }
        },
        end: (error) => {
          signal?.removeEventListener('abort', onAbort);
          // The caller asked to stop first: report that, whatever happened to the engine after.
          reject(stopping ? new EngineError('cancelled') : error);
        },
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.transport.send(`position fen ${fen}`);
      this.transport.send(`go depth ${depth}`);
    });
  }

  private reset(): Promise<void> {
    // An engine that is not ready has nothing to reset; the next `evaluate` reports why.
    if (this.state !== 'ready') return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.listener = {
        line: (line) => {
          if (line !== 'readyok') return;
          this.listener = null;
          resolve();
        },
        end: () => resolve(),
      };
      this.transport.send('ucinewgame');
      this.transport.send('isready');
    });
  }
}
