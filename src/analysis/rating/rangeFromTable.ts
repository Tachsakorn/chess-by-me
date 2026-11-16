import type { RatingRange } from '@/contract';

/** One accuracy band of the calibration table and the rating spread seen in it. */
export interface CalibrationBucket {
  /** Inclusive lower edge of the accuracy band. */
  accuracyFrom: number;
  /** Exclusive upper edge (the last bucket also holds exactly this value). */
  accuracyTo: number;
  /** 20th percentile of rating in this band, smoothed so it never falls as accuracy rises. */
  low: number;
  /** 80th percentile of rating in this band, smoothed the same way. */
  high: number;
  /** Rows the percentiles were computed from. */
  n: number;
  /** The 20th percentile as measured, before smoothing. Kept for the record; not used. */
  rawLow?: number;
  /** The 80th percentile as measured, before smoothing. Kept for the record; not used. */
  rawHigh?: number;
}

const STEP = 50;
const MIN_WIDTH = 100;

/** The bucket holding `accuracy`, or the nearest one when it lies outside the table. */
function findBucket(table: readonly CalibrationBucket[], accuracy: number): CalibrationBucket {
  const first = table[0];
  const last = table[table.length - 1];
  if (first === undefined || last === undefined) throw new Error('empty calibration table');
  if (accuracy < first.accuracyFrom) return first;
  if (accuracy >= last.accuracyTo) return last;
  return table.find((b) => accuracy >= b.accuracyFrom && accuracy < b.accuracyTo) ?? last;
}

/**
 * Rating range for an accuracy: the bucket's 20th..80th percentile, low rounded
 * down and high rounded up to a multiple of 50, then widened to at least 100.
 * `table` must be sorted by accuracy and non-empty.
 */
export function rangeFromTable(table: readonly CalibrationBucket[], accuracy: number): RatingRange {
  const bucket = findBucket(table, accuracy);
  let low = Math.floor(bucket.low / STEP) * STEP;
  let high = Math.ceil(bucket.high / STEP) * STEP;
  while (high - low < MIN_WIDTH) {
    low -= STEP;
    if (high - low < MIN_WIDTH) high += STEP;
  }
  return { low, high };
}
