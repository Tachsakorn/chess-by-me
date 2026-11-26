import { describe, expect, it } from 'vitest';
import { isSlowDepth, reanalysis } from './depthChoice';

describe('reanalysis', () => {
  it('leads to Settings when the game already has the depth set there', () => {
    expect(reanalysis(18, 18)).toEqual({ kind: 'same', depth: 18 });
  });

  it('offers the depth of Settings, and warns from 20 up', () => {
    expect(reanalysis(18, 16)).toEqual({ kind: 'other', from: 18, to: 16, slow: false });
    expect(reanalysis(18, 20)).toEqual({ kind: 'other', from: 18, to: 20, slow: true });
    expect(reanalysis(22, 18)).toEqual({ kind: 'other', from: 22, to: 18, slow: false });
  });
});

describe('isSlowDepth', () => {
  it('is 20 and 22 of the choices', () => {
    expect([14, 16, 18, 20, 22].filter(isSlowDepth)).toEqual([20, 22]);
  });
});
