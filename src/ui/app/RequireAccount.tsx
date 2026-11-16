import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useApp } from './appStore';

/**
 * Home and My Games need a connected account: the first time the app opens, it goes to Connect
 * (BRIEF-UI section 1). Nothing shows until the device storage has been read, which is quick.
 */
export function RequireAccount({ children }: { children: ReactNode }) {
  const loaded = useApp((state) => state.loaded);
  const accounts = useApp((state) => state.accounts);
  if (!loaded) return null;
  if (!accounts) return <Navigate to="/connect" replace />;
  return children;
}
