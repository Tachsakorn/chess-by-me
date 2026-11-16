import { describe, expect, it } from 'vitest';
import { nonDecreasing } from './monotone';

describe('nonDecreasing', () => {
  it('leaves a sequence that already rises untouched', () => {
    expect(nonDecreasing([1, 2, 2, 5], [1, 1, 1, 1])).toEqual([1, 2, 2, 5]);
  });

  it('pools a dip with its neighbour into their weighted mean', () => {
    // 10 (weight 1) then 4 (weight 3): mean (10 + 12) / 4 = 5.5 for both.
    expect(nonDecreasing([1, 10, 4, 20], [1, 1, 3, 1])).toEqual([1, 5.5, 5.5, 20]);
  });

  it('keeps pooling backwards while the pooled value is still too low', () => {
    // 5, 6, then 1 with a heavy weight drags both earlier values down.
    const out = nonDecreasing([5, 6, 1], [1, 1, 8]);
    expect(out).toEqual([1.9, 1.9, 1.9]);
  });

  it('returns a non-decreasing sequence of the same length for any input', () => {
    const values = [1300, 1341, 1238, 1500, 1499, 900, 2000];
    const out = nonDecreasing(values, [5, 4, 2, 9, 1, 1, 3]);
    expect(out).toHaveLength(values.length);
    for (let i = 1; i < out.length; i++) expect(out[i]!).toBeGreaterThanOrEqual(out[i - 1]!);
  });

  it('handles empty and single inputs', () => {
    expect(nonDecreasing([], [])).toEqual([]);
    expect(nonDecreasing([7], [3])).toEqual([7]);
  });

  it('rejects mismatched lengths', () => {
    expect(() => nonDecreasing([1, 2], [1])).toThrow();
  });
});
