/**
 * Central enrichment registry (P1-8 / P2-5).
 *
 * The unit list is discovered from `src/data/enrichment/units-*.json` at
 * build time via import.meta.glob — adding a new unit means dropping a new
 * JSON file in that folder, no code edits required.
 *
 * P2-5: the JSON files were ~700kB of the main bundle. They are now loaded
 * through lazy dynamic imports (one shared async chunk); `readyEnrichments`
 * resolves before the app renders, so every sync accessor below keeps its
 * signature and no consumer needed changes.
 */
import type { EnrichmentData } from '@/types/index';

// Vite turns this glob into lazy dynamic imports; all modules land in one
// async chunk fetched in parallel by loadEnrichments().
const modules = import.meta.glob<EnrichmentData>(
  '../data/enrichment/units-*.json',
  { import: 'default' },
);

/** Sync view over the loaded modules; empty until loading completes. */
export const ENRICHMENTS: Record<string, EnrichmentData> = {};

let loadPromise: Promise<void> | null = null;

/** Kick off every unit's import once; resolves when all are registered. */
export function loadEnrichments(): Promise<void> {
  if (!loadPromise) {
    loadPromise = Promise.all(
      Object.values(modules).map((load) =>
        load().then((mod) => {
          ENRICHMENTS[mod.unit] = mod;
        }),
      ),
    ).then(() => undefined);
  }
  return loadPromise;
}

/** Unit numbers with enrichment content, sorted numerically. */
export const ENRICHED_UNITS: string[] = Object.keys(ENRICHMENTS).sort(
  (a, b) => Number(a) - Number(b),
);