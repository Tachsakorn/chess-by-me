import { describe, expect, it } from 'vitest';
import * as api from './index';

describe('classify package entry point', () => {
  it('exposes what the integration layer is meant to use', () => {
    expect(Object.keys(api).sort()).toEqual([
      'RULES_VERSION',
      'classifyGame',
      'classifyMove',
      'expectedPoints',
      'findOpening',
      'loadOpeningBook',
      'moveInputAt',
      'pointLoss',
    ]);
  });

  it('classifies a move through the entry point', () => {
    // A level game stays level: nothing lost.
    expect(api.pointLoss({ kind: 'cp', value: 0 }, { kind: 'cp', value: 0 }, 'white')).toBe(0);
    expect(api.expectedPoints({ kind: 'cp', value: 0 })).toBe(0.5);
  });
});
