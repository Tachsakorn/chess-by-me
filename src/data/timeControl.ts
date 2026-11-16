import type { TimeClass, TimeControl } from '@/contract';

/**
 * Time class by Lichess's rule: estimated duration = initial + 40 * increment (seconds);
 * under 180 bullet, under 480 blitz, under 1500 rapid, otherwise classical.
 * Source recorded in docs/sources/import.md.
 */
export function timeClassFor(initialSeconds: number, incrementSeconds: number): TimeClass {
  const estimate = initialSeconds + 40 * incrementSeconds;
  if (estimate < 180) return 'bullet';
  if (estimate < 480) return 'blitz';
  if (estimate < 1500) return 'rapid';
  return 'classical';
}

/** Parses a PGN/Chess.com TimeControl value such as "600+0", "60" or "1/86400". */
export function parseTimeControl(raw: string | null | undefined): TimeControl | null {
  if (raw === null || raw === undefined) return null;
  const text = raw.trim();
  if (text === '' || text === '-') return null;
  if (/^\d+\/\d+$/.test(text)) {
    return { raw: text, initialSeconds: null, incrementSeconds: null, timeClass: 'daily' };
  }
  const m = /^(\d+)(?:\+(\d+))?$/.exec(text);
  if (!m) return { raw: text, initialSeconds: null, incrementSeconds: null, timeClass: null };
  const initial = Number(m[1]);
  const increment = m[2] === undefined ? 0 : Number(m[2]);
  return {
    raw: text,
    initialSeconds: initial,
    incrementSeconds: increment,
    timeClass: timeClassFor(initial, increment),
  };
}
