import { useSyncExternalStore } from 'react';

/**
 * The two-column review of a landscape iPad (BRIEF-UI section 4): 900px wide and more. Also a
 * phone on its side (1.1.1, Fable review 1.1 B6-01): a landscape screen under 500px high has no
 * room for the board above the panels, so the board goes left, as on the iPad.
 */
export const WIDE_QUERY = '(min-width: 900px), (orientation: landscape) and (max-height: 499.98px)';
const QUERY = WIDE_QUERY;

function subscribe(onChange: () => void) {
  const list = window.matchMedia(QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

export function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
