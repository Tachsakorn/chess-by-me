import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINE_FILES, ENGINE_VERSION, engineScriptUrl } from './engineFiles';

// Tests run from the repository root (see vite.config.ts).
const stockfishDir = join(process.cwd(), 'node_modules', 'stockfish');

describe('ENGINE_FILES', () => {
  it('names files that exist in the installed stockfish package', () => {
    expect(statSync(join(stockfishDir, 'src', ENGINE_FILES.lite)).isFile()).toBe(true);
    expect(statSync(join(stockfishDir, 'src', ENGINE_FILES.full)).isFile()).toBe(true);
  });

  it('uses the single-threaded builds', () => {
    expect(ENGINE_FILES.lite).toBe('stockfish-17.1-lite-single-03e3232.js');
    expect(ENGINE_FILES.full).toBe('stockfish-17.1-single-a496a04.js');
  });

  it('states the version of the installed package', () => {
    const pkg = JSON.parse(readFileSync(join(stockfishDir, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(pkg.version.startsWith(`${ENGINE_VERSION}.`)).toBe(true);
    expect(ENGINE_FILES.lite).toContain(`stockfish-${ENGINE_VERSION}-`);
    expect(ENGINE_FILES.full).toContain(`stockfish-${ENGINE_VERSION}-`);
  });
});

describe('engineScriptUrl', () => {
  it('serves from /engines/ by default', () => {
    expect(engineScriptUrl('lite')).toBe('/engines/stockfish-17.1-lite-single-03e3232.js');
    expect(engineScriptUrl('full')).toBe('/engines/stockfish-17.1-single-a496a04.js');
  });

  it('joins a base with or without a trailing slash', () => {
    expect(engineScriptUrl('lite', '/app/engines')).toBe(
      '/app/engines/stockfish-17.1-lite-single-03e3232.js',
    );
    expect(engineScriptUrl('lite', '/app/engines/')).toBe(
      '/app/engines/stockfish-17.1-lite-single-03e3232.js',
    );
    expect(engineScriptUrl('full', 'https://example.test/e')).toBe(
      'https://example.test/e/stockfish-17.1-single-a496a04.js',
    );
  });
});
