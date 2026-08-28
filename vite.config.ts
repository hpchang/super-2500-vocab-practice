/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Hash-based routing so the build can deploy to any static host
// (Cloudflare Pages, GitHub Pages) without server route config.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  base: './',
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // .test.tsx is used by component-level tests (e.g. PracticeScreen
    // regression); each file opts into jsdom via a @vitest-environment
    // directive. Default environment stays node for the pure-logic suites.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: true,
    environmentOptions: {
      jsdom: {
        // Default about:blank is an opaque origin, where jsdom provides no
        // localStorage — session-resume tests need real storage semantics.
        url: 'https://localhost/',
      },
    },
  },
});