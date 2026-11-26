import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests (Fable review A10-01): the app in a real browser, against the dev server, with
 * the real-game fixtures loaded through dev/seed. Run with `npm run e2e`. On the owner's PC the
 * browser is the installed Edge; elsewhere set CHROMIUM_PATH (in the cloud sessions:
 * /opt/pw-browsers/chromium).
 */
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: '.',
  // The production-build and release tests have their own configs (playwright.prod.config.ts,
  // playwright.release.config.ts).
  testIgnore: ['prod/**', 'release/**'],
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5317',
    // A phone (iPhone 12-15) unless a test sets its own size.
    viewport: { width: 390, height: 844 },
    trace: 'off',
    ...(executablePath
      ? { launchOptions: { executablePath, args: ['--no-sandbox'] } }
      : { channel: 'msedge' }),
  },
  webServer: {
    command: 'npx vite --port 5317 --strictPort',
    cwd: '..',
    url: 'http://localhost:5317',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
