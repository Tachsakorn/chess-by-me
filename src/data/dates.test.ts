import { describe, expect, it } from 'vitest';
import { validPlayedAt, withValidDate } from './dates';

describe('validPlayedAt', () => {
  it('keeps real moments', () => {
    for (const value of [
      '2024-02-29T10:00:00Z',
      '2026-11-17T23:59:59Z',
      '1999-01-01T00:00:00Z',
      '2026-11-17T08:01:02.123Z',
    ]) {
      expect(validPlayedAt(value)).toBe(value);
    }
  });

  it('turns impossible dates into no date (Fable review 1.1 B4-04)', () => {
    for (const value of [
      '2024-00-00T00:00:00Z',
      '2024-13-40T00:00:00Z',
      '2023-02-29T00:00:00Z',
      '2024-04-31T00:00:00Z',
      '2024-01-01T24:00:00Z',
      '2024-01-01T10:60:00Z',
      '????-??-??T00:00:00Z',
      '2024-01-01',
      '',
      'yesterday',
    ]) {
      expect(validPlayedAt(value)).toBeNull();
    }
    expect(validPlayedAt(null)).toBeNull();
    expect(validPlayedAt(undefined)).toBeNull();
    expect(validPlayedAt(12)).toBeNull();
  });
});

describe('withValidDate', () => {
  it('returns the same object when the date is fine', () => {
    const game = { id: 'a', playedAt: '2024-02-29T10:00:00Z' };
    expect(withValidDate(game)).toBe(game);
    const none = { id: 'b', playedAt: null };
    expect(withValidDate(none)).toBe(none);
  });

  it('replaces an impossible date by null and keeps the rest', () => {
    expect(withValidDate({ id: 'a', playedAt: '2024-00-00T00:00:00Z' })).toEqual({
      id: 'a',
      playedAt: null,
    });
  });
});
