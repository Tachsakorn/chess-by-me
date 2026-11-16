import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Runs long, one-off TypeScript scripts (for example rating calibration) with the
// same module resolution as the app: `npm run script -- <name>` runs
// scripts/<name>.script.ts. A script file holds a single `it(...)` with no timeout.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['scripts/**/*.script.ts'],
    testTimeout: 0,
    hookTimeout: 0,
  },
});
