import type { ClozeQuestion } from '@/types/index';
import { getEnrichedEntry } from './data';

/**
 * Difficulty levels for cloze questions.
 * - easy:   human sentence, cross-POS distractors (e.g. noun vs verb — easy to rule out)
 * - medium: human sentence, same-POS distractors (must use meaning to choose)
 * - hard:   human sentence, same-POS + semantically near distractors
 *
 * Every question and its distractors are hand-authored in the enrichment data
 * (clozeEasy / clozeMedium / clozeHard). This generator only assembles them,
 * so it can never fabricate grammatically weird or semantically absurd frames.
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '簡易',
  medium: '中等',
  hard: '艱難',
};

/** Per-POS count of questions. 5 total: 2 easy + 2 medium + 1 hard. */
export const QUESTIONS_PER_WORD = 5;
export const DIFFICULTY_COUNTS: Record<Difficulty, number> = {
  easy: 2,
  medium: 2,
  hard: 1,
};

// ── Cloze question generation ──────────────────────────────────────

export interface GeneratedCloze {
  difficulty: Difficulty;
  /** Index within that difficulty (0-based). */
  variant: number;
  cloze: ClozeQuestion;
}

/**
 * Assemble the 5 cloze questions for a single enriched entry from the
 * hand-authored enrichment fields: clozeEasy (2), clozeMedium (2),
 * clozeHard (1). A tier is skipped when its field is missing.
 */
export function generateClozeForEntry(entryId: string): GeneratedCloze[] {
  const enriched = getEnrichedEntry(entryId);
  if (!enriched) return [];

  const out: GeneratedCloze[] = [];
  for (let v = 0; v < DIFFICULTY_COUNTS.easy; v++) {
    const c = enriched.clozeEasy[v];
    if (c) out.push({ difficulty: 'easy', variant: v, cloze: c });
  }
  for (let v = 0; v < DIFFICULTY_COUNTS.medium; v++) {
    const c = enriched.clozeMedium[v];
    if (c) out.push({ difficulty: 'medium', variant: v, cloze: c });
  }
  if (enriched.clozeHard) {
    out.push({ difficulty: 'hard', variant: 0, cloze: enriched.clozeHard });
  }
  return out;
}

// ── Flatten all questions for an entry into a difficulty-indexed map ──

/** Flatten all questions for an entry into a difficulty-indexed map. */
export function clozeQuestionsForEntry(
  entryId: string,
): Record<Difficulty, ClozeQuestion[]> {
  const generated = generateClozeForEntry(entryId);
  const result: Record<Difficulty, ClozeQuestion[]> = {
    easy: [],
    medium: [],
    hard: [],
  };
  for (const g of generated) {
    result[g.difficulty].push(g.cloze);
  }
  return result;
}

/** Count variants available at a given difficulty for an entry. */
export function countClozeVariants(entryId: string, diff: Difficulty): number {
  return clozeQuestionsForEntry(entryId)[diff].length;
}
