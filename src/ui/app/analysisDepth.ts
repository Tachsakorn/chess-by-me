/**
 * The search depth the user picks in Settings (owner, 1.1 round 1): 14, 16, 18, 20 or 22, 18 by
 * default. Kept in localStorage under `cbm.depth`; anything else read there, or storage that is
 * blocked, means 18.
 *
 * It is read when a game's analysis starts (`analysisOptions`), so a game already running keeps
 * the depth it started with and a game still waiting in line takes the new one. Each analysis
 * keeps the depth it was made with (`GameAnalysis.engine.depth`); games already analysed are not
 * analysed again when the setting changes.
 */
import type { AnalysisOptions } from '@/contract';
import { APP_ANALYSIS_OPTIONS } from '@/analysis';

export const DEPTH_CHOICES = [14, 16, 18, 20, 22] as const;
export type DepthChoice = (typeof DEPTH_CHOICES)[number];
export const DEFAULT_DEPTH: DepthChoice = 18;
export const DEPTH_KEY = 'cbm.depth';

/** The depth a stored value stands for: one of the choices, written exactly, or 18. */
export function parseDepth(raw: string | null): DepthChoice {
  return DEPTH_CHOICES.find((depth) => String(depth) === raw) ?? DEFAULT_DEPTH;
}

/** The choice made while storage is blocked: it lasts until the page closes. */
let unsaved: DepthChoice | null = null;

export function readDepth(): DepthChoice {
  try {
    return parseDepth(localStorage.getItem(DEPTH_KEY));
  } catch {
    return unsaved ?? DEFAULT_DEPTH;
  }
}

export function saveDepth(depth: DepthChoice): void {
  unsaved = depth;
  try {
    localStorage.setItem(DEPTH_KEY, String(depth));
  } catch {
    // storage blocked: `unsaved` keeps the choice for this visit
  }
}

/** The options for an analysis that starts now: the app's own, at the depth picked. */
export function analysisOptions(): AnalysisOptions {
  return { ...APP_ANALYSIS_OPTIONS, depth: readDepth() };
}
