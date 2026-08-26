import type { VocabEntry } from '@/types/index';
import { isPracticable } from './data';
import type { EntryProgress } from '@/types/index';

export type FilterMode = 'important' | 'review' | 'wrong' | 'custom' | 'all';

export interface SelectionCriteria {
  mode: FilterMode;
  /** For custom mode: explicit set of entryIds the user checked. */
  customIds?: string[];
}

/**
 * Resolve a filter against a Unit's full entry list + progress map.
 * Returns only entries that are practiceable (have enrichment content)
 * unless the mode is "all" (used for browsing).
 */
export function filterEntries(
  entries: VocabEntry[],
  progress: Record<string, EntryProgress>,
  criteria: SelectionCriteria,
  practiceableOnly = true,
): VocabEntry[] {
  let result = entries;
  switch (criteria.mode) {
    case 'important':
      result = entries.filter((e) => e.important);
      break;
    case 'review':
      result = entries.filter((e) => {
        const p = progress[e.entryId];
        if (!p) return false;
        return isDueForReview(p, 0);
      });
      break;
    case 'wrong':
      result = entries.filter((e) => progress[e.entryId]?.inWrongQueue);
      break;
    case 'custom':
      if (criteria.customIds) {
        const set = new Set(criteria.customIds);
        result = entries.filter((e) => set.has(e.entryId));
      }
      break;
    case 'all':
    default:
      result = entries;
      break;
  }
  if (practiceableOnly && criteria.mode !== 'all') {
    result = result.filter((e) => isPracticable(e.entryId));
  }
  return result;
}

export const BATCH_SIZES = [5, 10, 20] as const;
export type BatchSize = (typeof BATCH_SIZES)[number];
export const DEFAULT_BATCH_SIZE: BatchSize = 10;

/**
 * Build a batch from selected entries, capped at batchSize.
 * Keeps the source order (alphabetical by workbook) for predictability.
 */
export function buildBatch(
  entries: VocabEntry[],
  batchSize: BatchSize,
): VocabEntry[] {
  return entries.slice(0, batchSize);
}

export function isDueForReview(p: EntryProgress, now: number): boolean {
  if (p.stage === 'new') return true;
  if (p.nextReviewAt == null) return true;
  return p.nextReviewAt <= now;
}

/** Supported question types for a given set of entries. */
export function availableQuestionTypes(entryIds: string[]): {
  type: 'flashcard' | 'en2zh' | 'zh2en' | 'cloze' | 'spelling' | 'mixed';
  available: number;
}[] {
  const types = [
    { type: 'flashcard' as const, available: entryIds.length },
    { type: 'en2zh' as const, available: entryIds.length },
    { type: 'zh2en' as const, available: entryIds.length },
    { type: 'cloze' as const, available: entryIds.length },
    { type: 'spelling' as const, available: entryIds.length },
    { type: 'mixed' as const, available: entryIds.length },
  ];
  return types;
}