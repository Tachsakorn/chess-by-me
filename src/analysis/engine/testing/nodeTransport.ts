// NODE ONLY. Only test files and scripts/ may import this: it needs Node
// (child processes, the file system) and must never reach the browser bundle.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { EngineVariant } from '@/contract';
import { ENGINE_FILES } from '../engineFiles';
import type { EngineTransport } from '../transport';

/**
 * Runs the same Stockfish script the browser loads, as a Node child process,
 * and speaks UCI over its stdin/stdout. When started as a main script the
 * stockfish.js build reads commands from stdin line by line and prints its
 * output to stdout.
 */
export function createNodeTransport(variant: EngineVariant): EngineTransport {
  const script = fileURLToPath(
    new URL(`../../../../node_modules/stockfish/src/${ENGINE_FILES[variant]}`, import.meta.url),
  );
  const child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lineListeners: Array<(line: string) => void> = [];
  const errorListeners: Array<(detail: string) => void> = [];
  let closed = false;
  let buffer = '';
  let stderr = '';

  const fail = (detail: string) => {
    if (closed) return;
    for (const listener of errorListeners) listener(detail);
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let end = buffer.indexOf('\n');
    while (end >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (line !== '' && !closed) for (const listener of lineListeners) listener(line);
      end = buffer.indexOf('\n');
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-2000);
  });
  // Writing to a process that has already gone raises EPIPE on stdin; the exit handler reports it.
  child.stdin.on('error', () => {});
  child.on('error', (error) => fail(`could not run the engine: ${error.message}`));
  child.on('exit', (code, signal) => {
    fail(`engine process exited (code ${code}, signal ${signal}) ${stderr.trim()}`.trim());
  });

  return {
    send(command) {
      if (!closed) child.stdin.write(`${command}\n`);
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
      child.kill();
    },
  };
}
