import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DEPTH,
  DEPTH_CHOICES,
  DEPTH_KEY,
  analysisOptions,
  parseDepth,
  readDepth,
  saveDepth,
} from './analysisDepth';

describe('parseDepth', () => {
  it('accepts each of the five choices', () => {
    for (const depth of [14, 16, 18, 20, 22]) expect(parseDepth(String(depth))).toBe(depth);
  });

  it('falls back to 18 for anything else', () => {
    for (const raw of [null, '', '17', '24', '0', '-18', '18.0', '18.5', ' 18', 'abc', '1e1']) {
      expect(parseDepth(raw)).toBe(18);
    }
  });
});

/** A localStorage of our own: the tests run in Node, which has none. */
function fakeStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, String(value)),
  };
}

describe('the stored depth', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers 14, 16, 18, 20 and 22, with 18 by default', () => {
    expect(DEPTH_CHOICES).toEqual([14, 16, 18, 20, 22]);
    expect(DEFAULT_DEPTH).toBe(18);
    expect(DEPTH_KEY).toBe('cbm.depth');
  });

  it('is 18 when nothing is saved', () => {
    expect(readDepth()).toBe(18);
  });

  it('reads back what was saved', () => {
    saveDepth(22);
    expect(localStorage.getItem('cbm.depth')).toBe('22');
    expect(readDepth()).toBe(22);
  });

  it('ignores a value that is not one of the choices', () => {
    localStorage.setItem('cbm.depth', '30');
    expect(readDepth()).toBe(18);
  });

  it('is 18 when storage cannot be read; a choice made then lasts for the visit', async () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    vi.resetModules();
    const fresh = await import('./analysisDepth');
    expect(fresh.readDepth()).toBe(18);
    expect(() => fresh.saveDepth(14)).not.toThrow();
    expect(fresh.readDepth()).toBe(14);
  });

  it('gives the app options with the stored depth, read at the moment of the call', () => {
    expect(analysisOptions()).toEqual({ engine: 'lite', depth: 18, useCloudEval: false });
    saveDepth(14);
    expect(analysisOptions().depth).toBe(14);
  });
});
