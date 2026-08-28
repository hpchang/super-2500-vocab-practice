import type { QuestionType } from '@/types/index';

/** Normalize a spelling answer: NFC, lowercase, collapse spaces, keep hyphen/apostrophes. */
export function normalizeSpelling(input: string): string {
  return input
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Exact comparison after normalization. Preserves hyphens, apostrophes, phrase spaces. */
export function checkSpelling(answer: string, expected: string): boolean {
  return normalizeSpelling(answer) === normalizeSpelling(expected);
}

export interface AnswerResult {
  correct: boolean;
  /** The chosen option entryId (for choice questions). */
  chosen?: string;
}

export function gradeChoice(
  chosenEntryId: string | undefined,
  answerEntryId: string,
): AnswerResult {
  if (!chosenEntryId) return { correct: false };
  return { correct: chosenEntryId === answerEntryId, chosen: chosenEntryId };
}

export function gradeFlashcard(rating: 'forgot' | 'familiar' | 'remembered'): AnswerResult {
  // "forgot" → wrong; "familiar" → correct but stays in learning; "remembered" → correct.
  return { correct: rating !== 'forgot' };
}

/** Aggregate results for the summary screen. */
export interface SessionSummary {
  total: number;
  correct: number;
  wrong: number;
  accuracy: number;
  byType: Record<string, { total: number; correct: number }>;
  wrongEntries: { entryId: string; type: QuestionType }[];
}

export function summarize(
  results: { entryId: string; type: QuestionType; correct: boolean }[],
): SessionSummary {
  const byType: Record<string, { total: number; correct: number }> = {};
  // Deduplicate by entryId — a word answered wrong twice (e.g. mixed
  // sessions) should appear once in 待再練 (P1-4).
  const wrongMap = new Map<string, { entryId: string; type: QuestionType }>();
  let correct = 0;
  for (const r of results) {
    const key = r.type;
    if (!byType[key]) byType[key] = { total: 0, correct: 0 };
    byType[key].total++;
    if (r.correct) {
      correct++;
      byType[key].correct++;
    } else if (!wrongMap.has(r.entryId)) {
      wrongMap.set(r.entryId, { entryId: r.entryId, type: r.type });
    }
  }
  const total = results.length;
  return {
    total,
    correct,
    wrong: total - correct,
    accuracy: total === 0 ? 0 : correct / total,
    byType,
    wrongEntries: [...wrongMap.values()],
  };
}