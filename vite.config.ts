import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { buildNotices, packageOf } from './scripts/third-party-notices.mjs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 10);

/**
 * Names the service worker's caches after the build (Fable review A6-04): the app cache after
 * the version and the page that names every hashed file, the engine cache after the engine's
 * files. Fills the placeholders in dist/sw.js once the build is written.
 */
function serviceWorkerNames(): Plugin {
  return {
    name: 'service-worker-names',
    apply: 'build',
    closeBundle() {
      const dist = fileURLToPath(new URL('./dist/', import.meta.url));
      const page = readFileSync(`${dist}index.html`, 'utf8');
      const engines = readdirSync(`${dist}engines`).sort().join('\n');
      const file = `${dist}sw.js`;
      const source = readFileSync(file, 'utf8');
      if (!source.includes('__BUILD_ID__') || !source.includes('__ENGINE_ID__')) {
        throw new Error('sw.js: cache name placeholders not found');
      }
      const named = source
        .replace('__BUILD_ID__', `${pkg.version}-${hash(page)}`)
        .replace('__ENGINE_ID__', hash(engines));
      writeFileSync(file, named);
    },
  };
}

/**
 * Writes THIRD-PARTY-NOTICES.txt next to the app (Fable review A5-02) from the licence files of
 * the packages whose code the bundle really holds, found from its module ids.
 */
function thirdPartyNotices(): Plugin {
  return {
    name: 'third-party-notices',
    apply: 'build',
    generateBundle(_options, bundle) {
      const packages = new Set<string>();
      for (const id of this.getModuleIds()) {
        const name = packageOf(id);
        if (name) packages.add(name);
      }
      if (packages.size === 0 || Object.keys(bundle).length === 0) {
        throw new Error('third-party notices: no packages found in the bundle');
      }
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD-PARTY-NOTICES.txt',
        source: buildNotices([...packages]),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorkerNames(), thirdPartyNotices()],
  // The version Settings shows, from package.json at build time.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Only the app and the dev pages are scanned for dependencies: the old spikes import font
  // packages that are no longer installed (Fable review A10-02).
  optimizeDeps: { entries: ['index.html', 'dev/**/*.html'] },
  build: {
    // The libraries in chunks of their own, so no chunk passes Vite's 500 kB warning (1.2). They
    // still load at start: index.html names them (modulepreload), and the service worker
    // precaches every file index.html names (public/sw.js), so the app works offline as before.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
            },
            {
              name: 'chess',
              test: /node_modules[\\/](@lichess-org[\\/]chessground|chess\.js)[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    // deploy/: the site's Worker script (1.1.1, Fable review 1.1 B1-01).
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'deploy/**/*.test.ts'],
    // The cburnett pieces are read from chessground's stylesheet with ?raw (src/ui/board/pieces.ts);
    // Vitest blanks stylesheets unless told to keep them.
    css: { include: [/chessground\.cburnett\.css/] },
  },
});
