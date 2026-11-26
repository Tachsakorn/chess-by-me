import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Layer rule (PROJECT_BRIEF section 5): UI / logic / data stay separate.
const noUiInLogic = {
  patterns: [
    { group: ['@/ui/*', '**/ui/**'], message: 'Logic and data layers must not import UI code.' },
    {
      group: ['react', 'react-dom', 'react-router', 'zustand'],
      message: 'Logic and data layers must stay framework-free.',
    },
  ],
};

export default defineConfig([
  globalIgnores([
    'dist',
    // The previous release, built by the release tests (e2e/release/servers.ts).
    '.release-cache',
    'coverage',
    'spikes',
    'public/engines',
    'playwright-report',
    'test-results',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
  },
  {
    files: ['src/analysis/**', 'src/data/**', 'src/contract/**'],
    rules: { 'no-restricted-imports': ['error', noUiInLogic] },
  },
  {
    files: ['src/contract/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...noUiInLogic.patterns,
            {
              group: ['@/analysis/*', '@/data/*', '**/analysis/**', '**/data/**'],
              message: 'The contract depends on nothing else in the app.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', fetch: 'readonly' },
    },
  },
]);
