import type { EntryProgress, Stage, QuestionType } from '@/types/index';

export const DAY_MS = 24 * 60 * 60 * 1000;

const REVIEW_INTERVALS: Record<Stage, number> = {
  new: 1,
  learning: 1,
  review: 3,
  strong: 7,
};

/** "有點熟" review interval — shorter than a clean correct answer (1 day). */
const FAMILIAR_INTERVAL_DAYS = 0.5;

export function makeInitialProgress(entryId: string): EntryProgress {
  return {
    entryId,
    stage: 'new',
    totalAnswered: 0,
    totalCorrect: 0,
    totalWrong: 0,
    streak: 0,
    lastAnsweredAt: null,
    nextReviewAt: null,
    inWrongQueue: false,
    lastWrongType: null,
    wrongCount: 0,
  };
}

/** Advance the stage on a correct answer. */
function advance(stage: Stage): Stage {
  // 'new' → 'learning' stays at learning for one correct, then review, then strong.
  if (stage === 'new') return 'learning';
  if (stage === 'learning') return 'review';
  if (stage === 'review') return 'strong';
  return 'strong';
}

export function recordAnswer(
  prev: EntryProgress,
  correct: boolean,
  type: QuestionType,
  now: number,
  /** Flashcard self-rating; 'familiar' keeps the stage but shortens the interval. */
  rating?: 'forgot' | 'familiar' | 'remembered',
): EntryProgress {
  const base: EntryProgress = {
    ...prev,
    totalAnswered: prev.totalAnswered + 1,
    lastAnsweredAt: now,
  };

  if (correct) {
    // "有點熟" (familiar): the word was recalled with effort, so unlike a
    // clean "remembered" it does NOT advance the stage (per the
    // "familiar 留在 learning" rule) and gets a shorter review interval.
    if (rating === 'familiar') {
      return {
        ...base,
        totalCorrect: prev.totalCorrect + 1,
        streak: prev.streak + 1,
        stage: prev.stage === 'new' ? 'learning' : prev.stage,
        nextReviewAt: now + FAMILIAR_INTERVAL_DAYS * DAY_MS,
        inWrongQueue: false,
        wrongCount: 0,
        lastWrongType: prev.lastWrongType,
      };
    }
    const nextStage = advance(prev.stage);
    const interval = REVIEW_INTERVALS[nextStage];
    return {
      ...base,
      totalCorrect: prev.totalCorrect + 1,
      streak: prev.streak + 1,
      stage: nextStage,
      nextReviewAt: now + interval * DAY_MS,
      inWrongQueue: false,
      wrongCount: 0,
      lastWrongType: prev.lastWrongType,
    };
  }

  // Wrong: drop back to learning, enter wrong queue.
  return {
    ...base,
    totalWrong: prev.totalWrong + 1,
    streak: 0,
    stage: 'learning',
    nextReviewAt: now + REVIEW_INTERVALS.learning * DAY_MS,
    inWrongQueue: true,
    wrongCount: prev.wrongCount + 1,
    lastWrongType: type,
  };
}

/** Entries due for review at `now`. */
export function dueEntries(
  progress: Record<string, EntryProgress>,
  now: number,
): string[] {
  return Object.values(progress)
    .filter((p) => p.nextReviewAt == null || p.nextReviewAt <= now)
    .map((p) => p.entryId);
}

/** Wrong-answer queue entries, deduplicated by entryId, with last wrong type. */
export function wrongQueueEntries(
  progress: Record<string, EntryProgress>,
): { entryId: string; lastWrongType: QuestionType | null; wrongCount: number }[] {
  return Object.values(progress)
    .filter((p) => p.inWrongQueue)
    .map((p) => ({
      entryId: p.entryId,
      lastWrongType: p.lastWrongType,
      wrongCount: p.wrongCount,
    }));
}