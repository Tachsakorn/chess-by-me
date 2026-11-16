import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/fonts';
import '@/styles/tokens.css';
import '@/styles/base.css';
import { App } from '@/ui/app/App';
import { listenForFirstTap } from '@/ui/sound/player';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Move sounds start at the first tap, as browsers require (owner, 2026-11-16).
listenForFirstTap();

// Offline support (public/sw.js). Not in development, where it would hold on to old files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app works without it, only not offline.
    });
  });
}
