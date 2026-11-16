import { describe, expect, it } from 'vitest';
import { engineCount } from './engineCount';

describe('engineCount', () => {
  it('uses one engine per core but one, at most four, at least one', () => {
    expect(engineCount(1)).toBe(1);
    expect(engineCount(2)).toBe(1);
    expect(engineCount(4)).toBe(3);
    expect(engineCount(8)).toBe(4); // an eight-core phone
    expect(engineCount(24)).toBe(4);
    expect(engineCount(undefined)).toBe(1);
  });

  it('keeps to two on a device with 2 GB of memory or less', () => {
    expect(engineCount(8, 2)).toBe(2);
    expect(engineCount(8, 1)).toBe(2);
    expect(engineCount(2, 1)).toBe(1);
    expect(engineCount(8, 4)).toBe(4);
  });
});
