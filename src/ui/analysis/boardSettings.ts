/**
 * The settings of the analysis board (owner, 2026-11-26): what is drawn on the board and how long
 * the engine thinks. Kept on this device and used at once, with no Save button. Sound is the
 * app's own switch (src/ui/sound/player.ts), not kept here.
 */
import { useSyncExternalStore } from 'react';

export interface BoardSettings {
  evalBar: boolean;
  suggestion: boolean;
  threat: boolean;
  labels: boolean;
  lines: boolean;
  /** Time per move, in seconds: 1..30. */
  seconds: number;
}

export const DEFAULT_BOARD_SETTINGS: BoardSettings = Object.freeze({
  evalBar: true,
  suggestion: true,
  threat: false,
  labels: true,
  lines: true,
  seconds: 5,
});

export const MIN_SECONDS = 1;
export const MAX_SECONDS = 30;
export const SECOND_CHOICES: readonly number[] = Array.from(
  { length: MAX_SECONDS - MIN_SECONDS + 1 },
  (_, index) => MIN_SECONDS + index,
);

export const BOARD_SETTINGS_KEY = 'cbm.analysis';
const CHANGE_EVENT = 'cbm-analysis-settings';

const SWITCHES = ['evalBar', 'suggestion', 'threat', 'labels', 'lines'] as const;

/** Settings from what is stored; anything missing or not understood takes its default. */
export function parseBoardSettings(raw: string | null): BoardSettings {
  let stored: unknown;
  try {
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }
  const record = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const settings: BoardSettings = { ...DEFAULT_BOARD_SETTINGS };
  for (const key of SWITCHES) {
    if (typeof record[key] === 'boolean') settings[key] = record[key];
  }
  const seconds = record.seconds;
  if (
    typeof seconds === 'number' &&
    Number.isInteger(seconds) &&
    seconds >= MIN_SECONDS &&
    seconds <= MAX_SECONDS
  ) {
    settings.seconds = seconds;
  }
  return settings;
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(BOARD_SETTINGS_KEY);
  } catch {
    return null;
  }
}

/** Keeps one object per stored text, so React sees no change until something changed. */
let cache: { raw: string | null; settings: BoardSettings } | null = null;

export function readBoardSettings(): BoardSettings {
  const raw = readRaw();
  if (!cache || cache.raw !== raw) cache = { raw, settings: parseBoardSettings(raw) };
  return cache.settings;
}

export function saveBoardSettings(change: Partial<BoardSettings>): void {
  const next = parseBoardSettings(JSON.stringify({ ...readBoardSettings(), ...change }));
  try {
    localStorage.setItem(BOARD_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked (private mode): the change still holds until the page is left.
    cache = { raw: readRaw(), settings: next };
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === BOARD_SETTINGS_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useBoardSettings(): BoardSettings {
  return useSyncExternalStore(subscribe, readBoardSettings, () => DEFAULT_BOARD_SETTINGS);
}
