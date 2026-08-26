import type { QuestionType } from './questions';

/** Familiarity stages following a simplified Leitner system. */
export type Stage = 'new' | 'learning' | 'review' | 'strong';

export interface EntryProgress {
  entryId: string;
  stage: Stage;
  totalAnswered: number;
  totalCorrect: number;
  totalWrong: number;
  /** Current streak of correct answers. */
  streak: number;
  /** Epoch ms of last answer. */
  lastAnsweredAt: number | null;
  /** Epoch ms of scheduled next review. */
  nextReviewAt: number | null;
  /** Whether this entry is still in the wrong-answer queue. */
  inWrongQueue: boolean;
  /** Most recent question type answered wrong (for re-practice). */
  lastWrongType: QuestionType | null;
  /** Times answered wrong since last correct. */
  wrongCount: number;
}

export interface ProgressData {
  schemaVersion: number;
  entries: Record<string, EntryProgress>;
}