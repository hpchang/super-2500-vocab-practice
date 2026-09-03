import type { VocabEntry } from '@/types/index';
import type { EntryProgress } from '@/types/index';

export type FilterMode = 'important' | 'review' | 'wrong' | 'custom' | 'all';

export interface SelectionCriteria {
  mode: FilterMode;
  /** For custom mode: explicit set of entryIds the user checked. */
  customIds?: string[];
}

/**
 * Resolve a filter against a Unit's full entry list + progress map.
 */
export function filterEntries(
  entries: VocabEntry[],
  progress: Record<string, EntryProgress>,
  criteria: SelectionCriteria,
  now: number = Date.now(),
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
        return isDueForReview(p, now);
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
  return result;
}

export const BATCH_SIZES = [5, 20, 40] as const;
export type BatchSize = (typeof BATCH_SIZES)[number];
export const DEFAULT_BATCH_SIZE: BatchSize = 20;

/**
 * Build a batch from selected entries, capped at batchSize.
 * Within the batch, entries are grouped by priority so repeated
 * sessions surface the words that most need work first:
 *   1. wrong-answer queue (inWrongQueue)
 *   2. due for review      (isDueForReview)
 *   3. unpracticed         (no progress record yet)
 *   4. the rest            (practiced but not due)
 *   5. recently practiced  (answered within RECENT_PRACTICE_MS) — demoted
 *      below even "rest" so the next round of a group larger than one
 *      batch moves on to unseen words instead of repeating the same head
 *      (a word answered correctly stays stage 'new', which isDueForReview
 *      counts as due forever). Wrong-queue entries are never demoted —
 *      they need the reps regardless of recency.
 * Source order (alphabetical by workbook) is kept within each group,
 * so the first session (empty progress) still starts at the head.
 */
/** Words answered within this window are demoted to the batch tail. */
const RECENT_PRACTICE_MS = 12 * 60 * 60 * 1000;

export function buildBatch(
  entries: VocabEntry[],
  batchSize: BatchSize,
  progress?: Record<string, EntryProgress>,
  now: number = Date.now(),
): VocabEntry[] {
  if (!progress) return entries.slice(0, batchSize);
  const wrong: VocabEntry[] = [];
  const due: VocabEntry[] = [];
  const unpracticed: VocabEntry[] = [];
  const rest: VocabEntry[] = [];
  const recent: VocabEntry[] = [];
  for (const e of entries) {
    const p = progress[e.entryId];
    if (p?.inWrongQueue) wrong.push(e);
    else if (!p) unpracticed.push(e);
    else if (isDueForReview(p, now)) due.push(e);
    else if (
      p.lastAnsweredAt != null &&
      now - p.lastAnsweredAt < RECENT_PRACTICE_MS
    ) {
      recent.push(e);
    } else rest.push(e);
  }
  return [...wrong, ...due, ...unpracticed, ...rest, ...recent].slice(
    0,
    batchSize,
  );
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