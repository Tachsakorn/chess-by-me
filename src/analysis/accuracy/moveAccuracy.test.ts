import { describe, expect, it } from 'vitest';
import { moveAccuracy } from './moveAccuracy';

describe('moveAccuracy', () => {
  it('is 100 when nothing is lost', () => {
    expect(moveAccuracy(60, 60)).toBe(100);
  });

  it('is 100, never more, when the position improves for the mover', () => {
    expect(moveAccuracy(40, 55)).toBe(100);
    expect(moveAccuracy(0, 100)).toBe(100);
  });

  it('gives 64.6 for a 10-point loss', () => {
    expect(moveAccuracy(70, 60)).toBeCloseTo(64.6, 1);
  });

  it('gives 0 for a 100-point loss', () => {
    expect(moveAccuracy(100, 0)).toBe(0);
  });

  it('includes the +1 bonus for a tiny loss', () => {
    // A 0.1 loss gives 100.55 before clamping, so 100.
    expect(moveAccuracy(50.1, 50)).toBe(100);
    // A 1-point loss: 103.1668 * e^-0.0435 - 3.1669 + 1 = 96.60
    expect(moveAccuracy(51, 50)).toBeCloseTo(96.6, 2);
  });

  it('is never negative and never above 100', () => {
    for (let loss = 0; loss <= 100; loss += 0.5) {
      const a = moveAccuracy(100, 100 - loss);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(100);
    }
  });
});
