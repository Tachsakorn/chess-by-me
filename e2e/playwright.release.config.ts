import { defineConfig } from '@playwright/test';

/**
 * Release tests (1.1.1, Fable review 1.1 area 8 tests 1-4): the production build served by
 * `wrangler dev` from deploy/production, the way chessby.me serves it (the Worker, _headers, the
 * single-page fallback; nothing is uploaded). Wrangler builds the production files itself first.
 * Never run wrangler at the root of the repository: the server starts in deploy/production.
 *
 *   site.release.spec.ts     headers, a missing script, a full flow with no console error or CSP
 *                            report (test 1)
 *   visits.release.spec.ts   second and third visit and a browser restart, one profile (test 2)
 *   update.release.spec.ts   the previous release and this build behind one address (test 3)
 *   offline.release.spec.ts  offline after one analysis (test 4)
 */
const executablePath = process.env.CHROMIUM_PATH;

export const RELEASE_PORT = 5320;

export default defineConfig({
  testDir: './release',
  testMatch: '*.release.spec.ts',
  timeout: 900_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${RELEASE_PORT}`,
    viewport: { width: 390, height: 844 },
    trace: 'off',
    ...(executablePath
      ? { launchOptions: { executablePath, args: ['--no-sandbox'] } }
      : { channel: 'msedge' }),
  },
  webServer: {
    command: `npx wrangler dev --local --port ${RELEASE_PORT} --ip 127.0.0.1`,
    cwd: '../deploy/production',
    url: `http://127.0.0.1:${RELEASE_PORT}`,
    reuseExistingServer: false,
    timeout: 600_000,
  },
});
