import { describe, expect, it } from 'vitest';
import type { TimeClass } from '@/contract';
import calibration from './calibration.json';
import sample from './__fixtures__/calibration-sample.json';
import { estimateRating } from './estimateRating';
import { rangeFromTable } from './rangeFromTable';

const blitz = (accuracy: number) =>
  estimateRating({ accuracy, timeClass: 'blitz', playerMoves: 30 })!;

describe('estimateRating (against the committed calibration table)', () => {
  it('gives no estimate for fewer than 10 moves', () => {
    expect(estimateRating({ accuracy: 80, timeClass: 'blitz', playerMoves: 9 })).toBeNull();
    expect(estimateRating({ accuracy: 80, timeClass: 'blitz', playerMoves: 0 })).toBeNull();
    expect(estimateRating({ accuracy: 80, timeClass: 'blitz', playerMoves: 10 })).not.toBeNull();
  });

  it('gives no estimate for an accuracy that is not a number', () => {
    expect(
      estimateRating({ accuracy: Number.NaN, timeClass: 'blitz', playerMoves: 30 }),
    ).toBeNull();
  });

  it('returns whole multiples of 50 at least 100 apart', () => {
    for (let accuracy = 0; accuracy <= 100; accuracy += 2.5) {
      for (const timeClass of ['bullet', 'blitz', 'rapid', 'classical', 'daily', null] as const) {
        const r = estimateRating({ accuracy, timeClass, playerMoves: 30 })!;
        expect(Number.isInteger(r.low) && Number.isInteger(r.high)).toBe(true);
        expect(r.low % 50).toBe(0);
        expect(r.high % 50).toBe(0);
        expect(r.high - r.low).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it('never gives a lower range for a higher accuracy', () => {
    for (const timeClass of ['bullet', 'blitz', 'rapid', null] as const) {
      let previous = estimateRating({ accuracy: 0, timeClass, playerMoves: 30 })!;
      for (let accuracy = 1; accuracy <= 100; accuracy++) {
        const r = estimateRating({ accuracy, timeClass, playerMoves: 30 })!;
        expect(r.low).toBeGreaterThanOrEqual(previous.low);
        expect(r.high).toBeGreaterThanOrEqual(previous.high);
        previous = r;
      }
    }
    // The estimate does respond to accuracy: the two ends of the scale differ.
    expect(blitz(95).low).toBeGreaterThan(blitz(40).low);
    expect(blitz(95).high).toBeGreaterThan(blitz(40).high);
  });

  it('uses the table of the time class when there is one', () => {
    expect(calibration.tables.blitz).toBeDefined();
    expect(blitz(72)).toEqual(rangeFromTable(calibration.tables.blitz, 72));
  });

  it('falls back to the all-games table for a missing, daily or uncalibrated class', () => {
    const all = rangeFromTable(calibration.tables.all, 72);
    expect('classical' in calibration.tables).toBe(false);
    for (const timeClass of [null, 'daily', 'classical'] as (TimeClass | null)[]) {
      expect(estimateRating({ accuracy: 72, timeClass, playerMoves: 30 })).toEqual(all);
    }
  });

  it('uses the nearest bucket for an accuracy outside the table', () => {
    expect(blitz(5)).toEqual(blitz(0));
    expect(estimateRating({ accuracy: -3, timeClass: 'blitz', playerMoves: 30 })).toEqual(blitz(0));
    expect(estimateRating({ accuracy: 140, timeClass: 'blitz', playerMoves: 30 })).toEqual(
      blitz(100),
    );
  });

  it('covers at least half of the real held-out sample', () => {
    // Guard against a broken table. The measured share is in docs/CALIBRATION.md.
    expect(sample.rows).toHaveLength(200);
    let inside = 0;
    for (const row of sample.rows) {
      const r = estimateRating({
        accuracy: row.accuracy,
        timeClass: row.timeClass as TimeClass,
        playerMoves: row.moves,
      });
      if (r && row.rating >= r.low && row.rating <= r.high) inside++;
    }
    expect(inside / sample.rows.length).toBeGreaterThanOrEqual(0.5);
  });
});
