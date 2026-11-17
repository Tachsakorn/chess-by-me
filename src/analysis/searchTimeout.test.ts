import { describe, expect, it } from 'vitest';
import { searchTimeoutMs } from './searchTimeout';

describe('searchTimeoutMs', () => {
  it('gives each depth offered in Settings its time limit per position', () => {
    expect(searchTimeoutMs(14)).toBe(120_000);
    expect(searchTimeoutMs(16)).toBe(120_000);
    expect(searchTimeoutMs(18)).toBe(120_000);
    expect(searchTimeoutMs(20)).toBe(240_000);
    expect(searchTimeoutMs(22)).toBe(480_000);
  });

  it('gives a depth between or beyond them the limit of the next deeper step', () => {
    expect(searchTimeoutMs(1)).toBe(120_000);
    expect(searchTimeoutMs(19)).toBe(240_000);
    expect(searchTimeoutMs(21)).toBe(480_000);
    expect(searchTimeoutMs(30)).toBe(480_000);
  });
});
