import { describe, expect, it } from 'vitest';
import { arrowBrushes, arrowShapes } from './arrows';

describe('arrowShapes', () => {
  it('turns moves into arrows with their brush', () => {
    expect(
      arrowShapes([
        { uci: 'g1f3', kind: 'best' },
        { uci: 'e7e8q', kind: 'threat' },
      ]),
    ).toEqual([
      { orig: 'g1', dest: 'f3', brush: 'best' },
      { orig: 'e7', dest: 'e8', brush: 'threat' },
    ]);
  });

  it('leaves out what is not a move between two squares', () => {
    expect(
      arrowShapes([
        { uci: '', kind: 'best' },
        { uci: 'e2e2', kind: 'best' },
        { uci: 'z9a1', kind: 'threat' },
      ]),
    ).toEqual([]);
  });
});

describe('arrowBrushes', () => {
  it('takes the colours from the tokens and the rest from the base brush', () => {
    const base = { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 };
    const colours: Record<string, string> = { '--q-great': '#1a7f4b', '--danger': '#c4321c' };
    expect(arrowBrushes(base, (name) => colours[name]!)).toEqual({
      best: { key: 'best', color: '#1a7f4b', opacity: 1, lineWidth: 10 },
      threat: { key: 'threat', color: '#c4321c', opacity: 1, lineWidth: 10 },
    });
  });
});
