// Enable React 18's act() so component tests flush async state updates
// deterministically in the jsdom environment. Harmless for the pure-logic
// suites that keep the default node environment.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Node ≥22 exposes an experimental global `localStorage` that is inert
// without --localstorage-file. As an own property of globalIt shadows the
// real storage that vitest's jsdom environment exposes via window.jsdom,
// so session-resume tests would see `window.localStorage === undefined`.
// Re-point both storages at the jsdom window when it exists.
const jsdomWindow = (globalThis as any).jsdom?.window;
if (jsdomWindow) {
  for (const k of ['localStorage', 'sessionStorage'] as const) {
    try {
      delete (globalThis as any)[k];
    } catch {
      // not deletable — defineProperty below still wins as an own prop
    }
    Object.defineProperty(globalThis, k, {
      get: () => jsdomWindow[k],
      configurable: true,
    });
  }
}

// Enrichment data loads via dynamic import (P2-5). Kick it off in every test
// environment the way main.tsx does before rendering — the glob resolves to
// plain JSON imports in vitest, so it settles immediately.
import { loadEnrichments } from '../src/lib/enrichmentRegistry.js';
void loadEnrichments();
