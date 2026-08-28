/**
 * Central enrichment registry (P1-8 / P2-5).
 *
 * The unit list is discovered from `src/data/enrichment/units-*.json` at
 * build time via import.meta.glob — adding a new unit means dropping a new
 * JSON file in that folder, no code edits required.
 *
 * P2-5: the JSON files were ~700kB of the main bundle. They are now loaded
 * through lazy dynamic imports (one shared async chunk); `loadEnrichments()`
 * must complete before the app renders (main.tsx awaits it), so every sync
 * accessor in data.ts keeps its signature and no consumer needed changes.
 */
import type { EnrichmentData, EnrichedEntry } from '@/types/index';

// Vite turns this glob into lazy dynamic imports; all modules land in one
// async chunk fetched in parallel by loadEnrichments().
const modules = import.meta.glob<EnrichmentData>(
  '../data/enrichment/units-*.json',
  { import: 'default' },
);

/** Sync view over the loaded modules; filled in as they resolve. */
export const ENRICHMENTS: Record<string, EnrichmentData> = {};

/**
 * entryId → enriched entry, rebuilt as each unit's JSON arrives. Lives here
 * (not built once at module init in data.ts) because with lazy loading the
 * modules are NOT yet present when this file first evaluates.
 */
export const ENRICH_MAP: Record<string, EnrichedEntry> = {};

let loadPromise: Promise<void> | null = null;

/** Kick off every unit's import once; resolves when all are registered. */
export function loadEnrichments(): Promise<void> {
  if (!loadPromise) {
    loadPromise = Promise.all(
      Object.values(modules).map((load) =>
        load().then((mod) => {
          ENRICHMENTS[mod.unit] = mod;
          for (const e of mod.entries) {
            ENRICH_MAP[e.entryId] = e;
          }
        }),
      ),
    ).then(() => undefined);
  }
  return loadPromise;
}