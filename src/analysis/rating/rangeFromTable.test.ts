import { describe, expect, it } from 'vitest';
import { rangeFromTable, type CalibrationBucket } from './rangeFromTable';

// Hand-built table for unit tests only.
const table: CalibrationBucket[] = [
  { accuracyFrom: 0, accuracyTo: 60, low: 812, high: 1388, n: 300 },
  { accuracyFrom: 60, accuracyTo: 80, low: 1201, high: 1650, n: 300 },
  { accuracyFrom: 80, accuracyTo: 100, low: 1700, high: 1749, n: 300 },
];

describe('rangeFromTable', () => {
  it('rounds low down and high up to multiples of 50', () => {
    expect(rangeFromTable(table, 30)).toEqual({ low: 800, high: 1400 });
    expect(rangeFromTable(table, 70)).toEqual({ low: 1200, high: 1650 });
  });

  it('widens a range narrower than 100 around its middle', () => {
    const r = rangeFromTable(table, 90);
    expect(r.high - r.low).toBeGreaterThanOrEqual(100);
    expect(r.low % 50).toBe(0);
    expect(r.high % 50).toBe(0);
    expect(r.low).toBeLessThanOrEqual(1700);
    expect(r.high).toBeGreaterThanOrEqual(1750);
  });

  it('puts a boundary accuracy in the upper bucket and 100 in the last', () => {
    expect(rangeFromTable(table, 60)).toEqual({ low: 1200, high: 1650 });
    expect(rangeFromTable(table, 100)).toEqual(rangeFromTable(table, 90));
  });

  it('uses the nearest bucket outside the table span', () => {
    const inner: CalibrationBucket[] = [
      { accuracyFrom: 40, accuracyTo: 50, low: 1000, high: 1300, n: 200 },
    ];
    expect(rangeFromTable(inner, 5)).toEqual({ low: 1000, high: 1300 });
    expect(rangeFromTable(inner, 99)).toEqual({ low: 1000, high: 1300 });
  });
});
