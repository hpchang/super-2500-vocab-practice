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

/** entryId 內嵌的 Unit（'u11:bed' → '11'）。entryId 解析的唯一實作，
 *  跨 Unit session 回報 payload 的 unit 欄也用它（不可用 session.unit——
 *  跨 Unit session 是 'multi'，那會變成 'umulti'）。 */
export function unitOfEntryId(entryId: string): string {
  return entryId.split(':')[0].slice(1);
}

export function getEntry(entryId: string): VocabEntry | undefined {
  const unit = unitOfEntryId(entryId);
  return getUnit(unit)?.entries.find((e) => e.entryId === entryId);
}