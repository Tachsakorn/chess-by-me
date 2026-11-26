/**
 * Analysing a game again from the review screen (1.2). The depth comes from Settings, as for any
 * analysis; the review only offers to use it. Analysing again at the depth the game already has
 * gives the same result (two runs at one depth gave the same figures, docs/STATUS.md step 3),
 * so that case leads to Settings instead.
 */

/** Depths that take much longer than the default (Settings and the review warn about them). */
export const SLOW_FROM = 20;

export function isSlowDepth(depth: number): boolean {
  return depth >= SLOW_FROM;
}

export type Reanalysis =
  { kind: 'same'; depth: number } | { kind: 'other'; from: number; to: number; slow: boolean };

/** What the review offers for a game analysed at `analysed` when Settings holds `setting`. */
export function reanalysis(analysed: number, setting: number): Reanalysis {
  if (analysed === setting) return { kind: 'same', depth: analysed };
  return { kind: 'other', from: analysed, to: setting, slow: isSlowDepth(setting) };
}
