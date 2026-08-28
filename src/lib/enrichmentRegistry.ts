/**
 * Central enrichment registry (P1-8).
 *
 * The unit list is discovered from `src/data/enrichment/units-*.json` at
 * build time via import.meta.glob — adding a new unit means dropping a new
 * JSON file in that folder, no code edits required.
 *
 * `unitMetadata` holds per-unit expected counts that used to be hardcoded
 * in the validator; extend this map when importing a new unit.
 */
import type { EnrichmentData } from '@/types/index';

// Vite resolves these globs into static imports at build time.
const modules = import.meta.glob<EnrichmentData>(
  '../data/enrichment/units-*.json',
  { eager: true, import: 'default' },
);

export const ENRICHMENTS: Record<string, EnrichmentData> = {};
for (const mod of Object.values(modules)) {
  ENRICHMENTS[mod.unit] = mod;
}

/** Unit numbers with enrichment content, sorted numerically. */
export const ENRICHED_UNITS: string[] = Object.keys(ENRICHMENTS).sort(
  (a, b) => Number(a) - Number(b),
);

/**
 * Workbook ground-truth counts per unit (total words, important words).
 * Used by validate-data; units not listed skip the fixed-count check.
 */
export const UNIT_METADATA: Record<string, { total: number; important: number }> = {
  '11': { total: 123, important: 65 },
  '12': { total: 130, important: 76 },
};