import { describe, it, expect } from 'vitest';
import { buildBatch, filterEntries } from '../src/lib/selection.js';
import type { VocabEntry, EntryProgress } from '../src/types/index.js';

function entry(entryId: string): VocabEntry {
  return {
    entryId,
    termId: entryId,
    word: entryId,
    page: 1,
    important: true,
    unit: '11',
  };
}

function practiced(entryId: string): EntryProgress {
  return {
    entryId,
    stage: 'review',
    totalAnswered: 1,
    totalCorrect: 1,
    totalWrong: 0,
    streak: 1,
    lastAnsweredAt: Date.now(),
    nextReviewAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
    inWrongQueue: false,
    lastWrongType: null,
    wrongCount: 0,
  };
}

describe('buildBatch', () => {
  const entries = [entry('a'), entry('b'), entry('c'), entry('d'), entry('e')];

  it('prioritizes unpracticed entries over practiced ones', () => {
    const progress = { b: practiced('b'), d: practiced('d') };
    const batch = buildBatch(entries, 5, progress);
    expect(batch.map((e) => e.entryId)).toEqual(['a', 'c', 'e', 'b', 'd']);
  });

  it('fills the batch with practiced entries when unpracticed run out', () => {
    const progress = { b: practiced('b'), d: practiced('d') };
    const batch = buildBatch(entries, 5, progress);
    // a, c, e (unpracticed) then b, d (practiced, workbook order).
    expect(batch.map((e) => e.entryId)).toEqual(['a', 'c', 'e', 'b', 'd']);
  });

  it('falls back to practiced-only order once everything is practiced', () => {
    const progress = Object.fromEntries(
      entries.map((e) => [e.entryId, practiced(e.entryId)]),
    );
    const batch = buildBatch(entries, 5, progress);
    expect(batch.map((e) => e.entryId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps workbook order within each group', () => {
    const progress = { c: practiced('c'), a: practiced('a') };
    // unpracticed b, d, e in order; practiced a, c in order.
    expect(buildBatch(entries, 5, progress).map((e) => e.entryId)).toEqual([
      'b',
      'd',
      'e',
      'a',
      'c',
    ]);
  });

  it('without progress keeps the original behavior (head slice)', () => {
    expect(buildBatch(entries, 5).map((e) => e.entryId)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });
});

describe('filterEntries', () => {
  it('important mode only returns important entries', () => {
    const entries = [
      { ...entry('a'), important: true },
      { ...entry('b'), important: false },
    ];
    const result = filterEntries(
      entries,
      {},
      { mode: 'important' },
      false,
    );
    expect(result.map((e) => e.entryId)).toEqual(['a']);
  });
});
