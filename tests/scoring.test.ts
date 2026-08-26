import { describe, it, expect } from 'vitest';
import {
  normalizeSpelling,
  checkSpelling,
  gradeChoice,
  gradeFlashcard,
  summarize,
} from '../src/lib/scoring.js';

describe('scoring', () => {
  it('normalizes: trims, lowercases, NFC, collapses spaces', () => {
    expect(normalizeSpelling('  Apartment ')).toBe('apartment');
    expect(normalizeSpelling('living  room')).toBe('living room');
    expect(normalizeSpelling("Don't")).toBe("don't");
  });

  it('preserves hyphens, apostrophes, and phrase spaces', () => {
    expect(checkSpelling('living room', 'living room')).toBe(true);
    expect(checkSpelling('Living Room', 'living room')).toBe(true);
    expect(checkSpelling("won't", "won't")).toBe(true);
    expect(checkSpelling('co-operate', 'co-operate')).toBe(true);
    expect(checkSpelling('cooperate', 'co-operate')).toBe(false);
  });

  it('gradeChoice compares entryId', () => {
    expect(gradeChoice('u11:bed', 'u11:bed').correct).toBe(true);
    expect(gradeChoice('u11:sofa', 'u11:bed').correct).toBe(false);
    expect(gradeChoice(undefined, 'u11:bed').correct).toBe(false);
  });

  it('gradeFlashcard: forgot is wrong, familiar/remembered are correct', () => {
    expect(gradeFlashcard('forgot').correct).toBe(false);
    expect(gradeFlashcard('familiar').correct).toBe(true);
    expect(gradeFlashcard('remembered').correct).toBe(true);
  });

  it('summarize computes accuracy and groups by type', () => {
    const s = summarize([
      { entryId: 'a', type: 'en2zh', correct: true },
      { entryId: 'b', type: 'en2zh', correct: false },
      { entryId: 'c', type: 'cloze', correct: true },
    ]);
    expect(s.total).toBe(3);
    expect(s.correct).toBe(2);
    expect(s.wrong).toBe(1);
    expect(s.accuracy).toBeCloseTo(2 / 3);
    expect(s.byType['en2zh']).toEqual({ total: 2, correct: 1 });
    expect(s.wrongEntries.map((w) => w.entryId)).toEqual(['b']);
  });
});