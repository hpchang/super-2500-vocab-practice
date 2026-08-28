import { defineConfig } from '@playwright/test';

// Smoke tests run against the real build (npm run check builds first, then
// serves dist/ via `vite preview`). Hash routing means a single URL serves
// every screen; navigation is asserted through the hash.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    // The app stores progress/session in localStorage; a clean context per
    // test keeps runs deterministic without an explicit clear.
    storageState: undefined,
  },
  webServer: {
    // `vite preview` serves the dist/ produced by `npm run build`. Command is
    // overridden by `npm run check`, which builds first; plain `npm run e2e`
    // assumes dist/ already exists.
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});