import { describe, it, expect } from 'vitest';
import {
  chooseDifficulty,
  nextQuestionIndex,
  recordClozeUsed,
  emptyClozeUsage,
} from '../src/lib/adaptive.js';
import type { EntryProgress } from '../src/types/index.js';

function makeProgress(over: Partial<EntryProgress>): EntryProgress {
  return {
    entryId: 'x',
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
    ...over,
  };
}

describe('chooseDifficulty', () => {
  it('returns medium for first time (no progress)', () => {
    expect(chooseDifficulty(undefined)).toBe('medium');
    expect(chooseDifficulty(makeProgress({}))).toBe('medium');
  });

  it('returns easy when error rate >= 50%', () => {
    const p = makeProgress({ totalAnswered: 4, totalCorrect: 1, totalWrong: 3, streak: 0, wrongCount: 1 });
    expect(chooseDifficulty(p)).toBe('easy');
  });

  it('returns easy when 2+ consecutive wrong even if overall accuracy ok', () => {
    const p = makeProgress({ totalAnswered: 10, totalCorrect: 7, totalWrong: 3, streak: 0, wrongCount: 2 });
    // accuracy = 0.7 (>=50%) but wrongCount >= 2 → easy
    expect(chooseDifficulty(p)).toBe('easy');
  });

  it('returns hard when accuracy >= 80% and 2+ consecutive correct', () => {
    const p = makeProgress({ totalAnswered: 10, totalCorrect: 9, totalWrong: 1, streak: 3, wrongCount: 0 });
    expect(chooseDifficulty(p)).toBe('hard');
  });

  it('returns medium when accuracy is decent but streak < 2', () => {
    const p = makeProgress({ totalAnswered: 5, totalCorrect: 4, totalWrong: 1, streak: 1, wrongCount: 0 });
    // accuracy 0.8 but streak only 1 → not hard
    expect(chooseDifficulty(p)).toBe('medium');
  });

  it('returns medium when accuracy is moderate and stable', () => {
    const p = makeProgress({ totalAnswered: 6, totalCorrect: 4, totalWrong: 2, streak: 1, wrongCount: 0 });
    expect(chooseDifficulty(p)).toBe('medium');
  });
});

describe('nextQuestionIndex', () => {
  it('returns 0 when nothing used', () => {
    expect(nextQuestionIndex([], 2)).toBe(0);
  });

  it('returns next unused index', () => {
    expect(nextQuestionIndex([0], 2)).toBe(1);
    expect(nextQuestionIndex([0, 1], 3)).toBe(2);
  });

  it('wraps around when all used', () => {
    expect(nextQuestionIndex([0, 1], 2)).toBe(0);
  });

  it('returns -1 when total is 0', () => {
    expect(nextQuestionIndex([], 0)).toBe(-1);
  });
});

describe('recordClozeUsed', () => {
  it('records usage per difficulty', () => {
    let usage = emptyClozeUsage();
    usage = recordClozeUsed(usage, 'easy', 0);
    usage = recordClozeUsed(usage, 'easy', 1);
    usage = recordClozeUsed(usage, 'hard', 0);
    expect(usage.byDifficulty.easy).toEqual([0, 1]);
    expect(usage.byDifficulty.hard).toEqual([0]);
    expect(usage.byDifficulty.medium).toBeUndefined();
  });
});