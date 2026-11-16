import { describe, expect, it } from 'vitest';
import { splitLines } from './transport';

describe('splitLines', () => {
  it('returns a single line as it is', () => {
    expect(splitLines('readyok')).toEqual(['readyok']);
  });

  it('splits a message holding several lines, dropping blank ones and line endings', () => {
    expect(splitLines('info depth 1 score cp 1 pv e2e4\r\nbestmove e2e4\n\n')).toEqual([
      'info depth 1 score cp 1 pv e2e4',
      'bestmove e2e4',
    ]);
  });

  it('returns nothing for data that is not text', () => {
    expect(splitLines(undefined)).toEqual([]);
    expect(splitLines({ type: 'ready' })).toEqual([]);
    expect(splitLines(42)).toEqual([]);
  });
});
