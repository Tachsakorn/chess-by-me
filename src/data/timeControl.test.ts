import { describe, expect, it } from 'vitest';
import { parseTimeControl, timeClassFor } from './timeControl';

describe('parseTimeControl', () => {
  it('parses initial+increment', () => {
    expect(parseTimeControl('600+0')).toEqual({
      raw: '600+0',
      initialSeconds: 600,
      incrementSeconds: 0,
      timeClass: 'rapid',
    });
    expect(parseTimeControl('180+2')?.timeClass).toBe('blitz');
    expect(parseTimeControl('1800+20')?.timeClass).toBe('classical');
  });
  it('parses a bare number of seconds', () => {
    expect(parseTimeControl('60')).toEqual({
      raw: '60',
      initialSeconds: 60,
      incrementSeconds: 0,
      timeClass: 'bullet',
    });
  });
  it('treats 1/seconds as daily', () => {
    expect(parseTimeControl('1/86400')).toEqual({
      raw: '1/86400',
      initialSeconds: null,
      incrementSeconds: null,
      timeClass: 'daily',
    });
  });
  it('returns null for absent values', () => {
    for (const v of ['-', '', null, undefined]) expect(parseTimeControl(v)).toBeNull();
  });
  it('keeps unparseable text with nulls', () => {
    expect(parseTimeControl('abc')).toEqual({
      raw: 'abc',
      initialSeconds: null,
      incrementSeconds: null,
      timeClass: null,
    });
  });
});

describe('timeClassFor', () => {
  it('uses initial + 40 * increment with Lichess thresholds', () => {
    expect(timeClassFor(179, 0)).toBe('bullet');
    expect(timeClassFor(180, 0)).toBe('blitz');
    expect(timeClassFor(479, 0)).toBe('blitz');
    expect(timeClassFor(480, 0)).toBe('rapid');
    expect(timeClassFor(1499, 0)).toBe('rapid');
    expect(timeClassFor(1500, 0)).toBe('classical');
    expect(timeClassFor(60, 1)).toBe('bullet');
    expect(timeClassFor(120, 1)).toBe('bullet');
    expect(timeClassFor(180, 2)).toBe('blitz');
  });
});
