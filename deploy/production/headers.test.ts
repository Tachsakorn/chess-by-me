import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain JavaScript build script, no type declarations
import { headersFile } from '../../scripts/site-files.mjs';

const file = (noindex: boolean) =>
  (headersFile as (o: { noindex: boolean }) => string)({ noindex });

describe('_headers (scripts/site-files.mjs)', () => {
  // 1.1.1, Fable review 1.1 B7-01 (owner): six months, this host only, not on the preload list.
  it('sends Strict-Transport-Security for six months, without includeSubDomains or preload', () => {
    for (const noindex of [false, true]) {
      const lines = file(noindex).split('\n');
      const hsts = lines.filter((line) => /strict-transport-security/i.test(line));
      expect(hsts).toEqual(['  Strict-Transport-Security: max-age=15552000']);
      // Under "/*", so every address carries it.
      expect(lines.indexOf(hsts[0]!)).toBeGreaterThan(lines.indexOf('/*'));
      expect(lines.indexOf(hsts[0]!)).toBeLessThan(lines.indexOf('/assets/*'));
    }
  });

  it('keeps noindex for the trial copy only', () => {
    expect(file(true)).toContain('X-Robots-Tag: noindex');
    expect(file(false)).not.toContain('X-Robots-Tag');
  });
});
