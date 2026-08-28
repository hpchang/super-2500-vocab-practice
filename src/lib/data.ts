import vocabData from '@/data/vocab.json';
import { ENRICHMENTS, ENRICH_MAP } from '@/lib/enrichmentRegistry';
import type {
  VocabData,
  VocabUnit,
  VocabEntry,
  EnrichmentData,
  EnrichedEntry,
} from '@/types/index';

const VOCAB = vocabData as VocabData;

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