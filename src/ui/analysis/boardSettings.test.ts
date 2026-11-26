import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOARD_SETTINGS_KEY,
  DEFAULT_BOARD_SETTINGS,
  parseBoardSettings,
  readBoardSettings,
  saveBoardSettings,
  SECOND_CHOICES,
} from './boardSettings';

describe('parseBoardSettings', () => {
  it('gives the defaults of the design for nothing stored', () => {
    expect(parseBoardSettings(null)).toEqual({
      evalBar: true,
      suggestion: true,
      threat: false,
      labels: true,
      lines: true,
      seconds: 5,
    });
  });

  it('keeps what it understands and defaults the rest', () => {
    expect(parseBoardSettings('{"threat":true,"seconds":12,"labels":"no"}')).toEqual({
      ...DEFAULT_BOARD_SETTINGS,
      threat: true,
      seconds: 12,
    });
    for (const seconds of [0, 31, 2.5, '5', null]) {
      expect(parseBoardSettings(JSON.stringify({ seconds })).seconds).toBe(5);
    }
    expect(parseBoardSettings('not json')).toEqual(DEFAULT_BOARD_SETTINGS);
    expect(parseBoardSettings('[1,2]')).toEqual(DEFAULT_BOARD_SETTINGS);
  });

  it('offers every second from 1 to 30', () => {
    expect(SECOND_CHOICES[0]).toBe(1);
    expect(SECOND_CHOICES.at(-1)).toBe(30);
    expect(SECOND_CHOICES).toHaveLength(30);
  });
});

describe('saving', () => {
  let items: Map<string, string>;
  let events: string[];
  beforeEach(() => {
    items = new Map();
    events = [];
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, String(value)),
    });
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => events.push(event.type),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('stores a change at once and tells the screen', () => {
    saveBoardSettings({ threat: true, seconds: 10 });
    expect(JSON.parse(items.get(BOARD_SETTINGS_KEY)!)).toMatchObject({ threat: true, seconds: 10 });
    expect(readBoardSettings()).toMatchObject({ threat: true, seconds: 10, evalBar: true });
    expect(events).toEqual(['cbm-analysis-settings']);
  });

  it('gives the same object while nothing changed', () => {
    saveBoardSettings({ lines: false });
    expect(readBoardSettings()).toBe(readBoardSettings());
  });

  it('never stores a value out of range', () => {
    saveBoardSettings({ seconds: 99 });
    expect(readBoardSettings().seconds).toBe(5);
  });

  it('still holds a change when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    saveBoardSettings({ suggestion: false });
    expect(readBoardSettings().suggestion).toBe(false);
  });
});
