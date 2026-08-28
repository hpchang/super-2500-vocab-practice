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
/**
 * Workbook ground-truth counts per unit (total words, important words).
 * Used by validate-data; units not listed skip the fixed-count check.
 */
export const UNIT_METADATA: Record<string, { total: number; important: number }> = {
  '11': { total: 123, important: 65 },
  '12': { total: 130, important: 76 },
  '13': { total: 212, important: 107 },
  '14': { total: 87, important: 58 },
  '15': { total: 24, important: 16 },
  '16': { total: 73, important: 62 },
  '17': { total: 30, important: 18 },
  '18': { total: 73, important: 39 },
  '19': { total: 29, important: 18 },
  '20': { total: 56, important: 10 },
  '21': { total: 42, important: 3 },
  '22': { total: 71, important: 46 },
  '23': { total: 90, important: 47 },
  '24': { total: 30, important: 30 },
  '25': { total: 16, important: 12 },
  '26': { total: 12, important: 10 },
  '27': { total: 53, important: 41 },
  '28': { total: 23, important: 23 },
  '29': { total: 146, important: 28 },
  '30': { total: 54, important: 32 },
  '31': { total: 136, important: 24 },
  '32': { total: 239, important: 111 },
};

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
