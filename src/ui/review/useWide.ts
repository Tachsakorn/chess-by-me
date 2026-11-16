import { useSyncExternalStore } from 'react';

/** The two-column review of a landscape iPad (BRIEF-UI section 4): 900px wide and more. */
const QUERY = '(min-width: 900px)';

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
