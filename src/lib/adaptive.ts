import type { Difficulty } from './clozeGenerator';
import type { EntryProgress } from '@/types/index';

/**
 * Adaptive difficulty selection per the agreed rules:
 * - First time (totalAnswered === 0)  → medium
 * - Error rate >= 50% OR streak <= -2  → easy
 * - Accuracy >= 80% AND streak >= 2   → hard
 * - Otherwise                          → medium
 *
 * streak: positive = consecutive correct, negative = consecutive wrong.
 * We derive it from EntryProgress.streak (reset on wrong, +1 on correct)
 * and wrongCount (consecutive wrongs since last correct).
 */
export function chooseDifficulty(p: EntryProgress | undefined): Difficulty {
  if (!p || p.totalAnswered === 0) return 'medium';

  const accuracy = p.totalAnswered > 0 ? p.totalCorrect / p.totalAnswered : 0;
  const consecutiveCorrect = p.streak;
  const consecutiveWrong = p.wrongCount;

  // Error rate >= 50% or 2+ consecutive wrong → drop to easy
  if (accuracy < 0.5 || consecutiveWrong >= 2) return 'easy';

  // Accuracy >= 80% and 2+ consecutive correct → challenge with hard
  if (accuracy >= 0.8 && consecutiveCorrect >= 2) return 'hard';

  return 'medium';
}

/**
 * Pick the next question index for a given difficulty, avoiding repeats
 * until all variants are used. Returns -1 if the difficulty pool is empty.
 *
 * `used` is the list of already-used question indices for this entry+difficulty.
 * `total` is the number of questions available at this difficulty.
 */
export function nextQuestionIndex(used: number[], total: number): number {
  if (total === 0) return -1;
  if (used.length >= total) {
    // All used — reset and start over (return first unused after reset).
    return 0;
  }
  const usedSet = new Set(used);
  for (let i = 0; i < total; i++) {
    if (!usedSet.has(i)) return i;
  }
  return 0;
}

/** Track used cloze indices per entry per difficulty in progress. */
export interface ClozeUsage {
  /** Map of difficulty → array of used question variant indices. */
  byDifficulty: Partial<Record<Difficulty, number[]>>;
}

export function emptyClozeUsage(): ClozeUsage {
  return { byDifficulty: {} };
}

export function recordClozeUsed(
  usage: ClozeUsage,
  difficulty: Difficulty,
  index: number,
): ClozeUsage {
  const prev = usage.byDifficulty[difficulty] ?? [];
  return {
    byDifficulty: {
      ...usage.byDifficulty,
      [difficulty]: [...prev, index],
    },
  };
}