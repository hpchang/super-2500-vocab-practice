import vocabData from '@/data/vocab.json';
import enrichment11 from '@/data/enrichment/units-11.json';
import enrichment12 from '@/data/enrichment/units-12.json';
import type {
  VocabData,
  VocabUnit,
  VocabEntry,
  EnrichmentData,
  EnrichedEntry,
} from '@/types/index';

const VOCAB = vocabData as VocabData;
const ENRICHMENTS: Record<string, EnrichmentData> = {
  '11': enrichment11 as EnrichmentData,
  '12': enrichment12 as EnrichmentData,
};

export function getVocabData(): VocabData {
  return VOCAB;
}

export function getUnits(): VocabUnit[] {
  return VOCAB.units;
}

export function getUnit(unit: string): VocabUnit | undefined {
  return VOCAB.units.find((u) => u.unit === unit);
}

export function getEnrichment(unit: string): EnrichmentData | undefined {
  return ENRICHMENTS[unit];
}

const ENRICH_MAP: Record<string, EnrichedEntry> = (() => {
  const map: Record<string, EnrichedEntry> = {};
  for (const key of Object.keys(ENRICHMENTS)) {
    for (const e of ENRICHMENTS[key].entries) {
      map[e.entryId] = e;
    }
  }
  return map;
})();

export function getEnrichedEntry(entryId: string): EnrichedEntry | undefined {
  return ENRICH_MAP[entryId];
}

/** Whether an entry has PoC-practiceable enrichment content. */
export function isPracticable(entryId: string): boolean {
  return Boolean(ENRICH_MAP[entryId]);
}

export function getPracticableEntries(unit: string): VocabEntry[] {
  const u = getUnit(unit);
  if (!u) return [];
  return u.entries.filter((e) => isPracticable(e.entryId));
}

/** Count of words currently practiceable in a unit. */
export function practicableCount(unit: string): number {
  return getPracticableEntries(unit).length;
}

export function getEntry(entryId: string): VocabEntry | undefined {
  const unit = entryId.split(':')[0].slice(1);
  return getUnit(unit)?.entries.find((e) => e.entryId === entryId);
}