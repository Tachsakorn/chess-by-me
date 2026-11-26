import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * WCAG AA contrast of the token pairs the app draws (1.2). Text needs 4.5:1, large text (24px,
 * or 18.66px bold) and graphics 3:1. Reads the real values from tokens.css, so a token change
 * that breaks a pair fails here. The move-quality badge marks are not listed: their colours wait
 * on the owner (DESIGN.md, "Contrast").
 */
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!match) throw new Error(`no hex value for --${name}`);
  return match[1]!;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// Kept below AA by the owner (2026-11-26): board coordinates, the amber cover word, the avatar,
// and the white marks of the Inaccuracy, Mistake/Miss and Excellent badges.
describe('token contrast', () => {
  const text: [string, string, string][] = [
    ['text-2 on the page', 'text-2', 'bg'],
    ['text-2 on a grey group', 'text-2', 'fill'],
    ['text-3 on a grey group', 'text-3', 'fill'],
    ['grey text on the dark card', 'dark-card-text-2', 'dark-card'],
    ['Inaccuracy move text', 'q-inaccuracy-text', 'fill'],
    ['Mistake move text', 'q-mistake-text', 'fill'],
    ['a destructive action (the Blunder red)', 'q-blunder', 'fill'],
  ];
  it.each(text)('%s: 4.5:1', (_name, fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  const large: [string, string, string][] = [
    ['red cover word', 'course-red', 'fill'],
    ['blue cover word', 'course-blue', 'fill'],
    ['pink cover word', 'course-pink', 'fill'],
    ['green cover word', 'course-green', 'fill'],
    ['the switch off', 'switch-off', 'fill'],
    ['the checking dot', 'q-checking', 'fill'],
  ];
  it.each(large)('%s: 3:1', (_name, fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(3);
  });

  it('measures a known pair as WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});
