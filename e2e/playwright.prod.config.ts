import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against the production build (1.1.0 release, 2026-11-17): what only a
 * production build has, chiefly the service worker. `npm run e2e` runs these after the dev-server
 * tests. The build is the plain one (`npm run build`), served by vite preview.
 */
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: './prod',
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5318',
    viewport: { width: 390, height: 844 },
    trace: 'off',
    ...(executablePath
      ? { launchOptions: { executablePath, args: ['--no-sandbox'] } }
      : { channel: 'msedge' }),
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 5318 --strictPort',
    cwd: '..',
    url: 'http://localhost:5318',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
