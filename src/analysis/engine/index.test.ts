import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as api from './index';

describe('the engine package entry point', () => {
  it('exports the public pieces and nothing else', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'CLOUD_EVAL_URL',
        'ENGINE_FILES',
        'ENGINE_VERSION',
        'EngineError',
        'UciEngine',
        'createWorkerTransport',
        'engineScriptUrl',
        'evaluateGame',
        'evaluatePosition',
        'fetchCloudEval',
        'parseBestMove',
        'parseInfo',
        'toWhiteScore',
      ].sort(),
    );
  });

  it('keeps Node-only code out of everything the browser can load', () => {
    const folder = fileURLToPath(new URL('.', import.meta.url));
    const shipped = readdirSync(folder).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    );
    expect(shipped).toContain('index.ts');
    expect(shipped.length).toBeGreaterThan(5);
    for (const name of shipped) {
      const source = readFileSync(`${folder}/${name}`, 'utf8');
      expect(source, name).not.toMatch(/from\s+'node:/);
      expect(source, name).not.toMatch(/from\s+'\.\/testing\//);
    }
  });
});
