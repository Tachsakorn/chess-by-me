/**
 * How UCI text travels between this package and an engine process. The engine
 * class only sees this interface, so it runs the same over a Web Worker in the
 * browser and over a child process in tests.
 */
export interface EngineTransport {
  /** Sends one UCI command (no line ending). */
  send(command: string): void;
  /** Registers a listener that receives the engine's output one line at a time. */
  onLine(listener: (line: string) => void): void;
  /** Registers a listener for a failure of the engine process itself. */
  onError(listener: (detail: string) => void): void;
  /** Ends the engine process. Nothing is delivered after this. */
  close(): void;
}

/** The non-empty lines of one worker message. Data that is not text gives no lines. */
export function splitLines(data: unknown): string[] {
  if (typeof data !== 'string') return [];
  return data
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * BROWSER ONLY: runs a Stockfish script in a Web Worker. This is the one
 * function of the package that is not exercised by the Node tests; everything
 * it does beyond wiring events is in `splitLines`.
 *
 * The stockfish.js builds act as a classic worker script: they take one UCI
 * command per posted string, queue commands that arrive before the WASM is
 * ready, and post output back as strings (one or more lines per message).
 * A script that cannot be fetched or that throws surfaces as an `error` event.
 */
export function createWorkerTransport(scriptUrl: string): EngineTransport {
  const worker = new Worker(scriptUrl);
  const lineListeners: Array<(line: string) => void> = [];
  const errorListeners: Array<(detail: string) => void> = [];
  let closed = false;

  const fail = (detail: string) => {
    if (closed) return;
    for (const listener of errorListeners) listener(detail);
  };

  worker.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (closed) return;
    for (const line of splitLines(event.data)) {
      for (const listener of lineListeners) listener(line);
    }
  });
  worker.addEventListener('error', (event) => {
    // A failed script load gives an event without a message.
    fail(event.message || `worker error while running ${scriptUrl}`);
  });
  worker.addEventListener('messageerror', () => {
    fail('worker message could not be read');
  });

  return {
    send(command) {
      if (!closed) worker.postMessage(command);
    },
    onLine(listener) {
      lineListeners.push(listener);
    },
    onError(listener) {
      errorListeners.push(listener);
    },
    close() {
      if (closed) return;
      closed = true;
      worker.terminate();
    },
  };
}
