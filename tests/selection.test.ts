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

function inWrongQueue(entryId: string): EntryProgress {
  return {
    entryId,
    stage: 'learning',
    totalAnswered: 1,
    totalCorrect: 0,
    totalWrong: 1,
    streak: 0,
    lastAnsweredAt: Date.now(),
    nextReviewAt: Date.now() - 1000,
    inWrongQueue: true,
    lastWrongType: 'en2zh',
    wrongCount: 1,
  };
}

function due(entryId: string): EntryProgress {
  return {
    ...practiced(entryId),
    nextReviewAt: Date.now() - 1000,
  };
}

describe('buildBatch', () => {
  const entries = [entry('a'), entry('b'), entry('c'), entry('d'), entry('e')];

  it('without progress keeps the original behavior (head slice)', () => {
    expect(buildBatch(entries, 5).map((e) => e.entryId)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('prioritizes wrong-queue entries, then due, then unpracticed, then rest', () => {
    // a: wrong queue, b: due, c: unpracticed, d: practiced-not-due, e: unpracticed
    const progress = {
      a: inWrongQueue('a'),
      b: due('b'),
      d: practiced('d'),
    };
    const batch = buildBatch(entries, 5, progress, Date.now());
    expect(batch.map((e) => e.entryId)).toEqual(['a', 'b', 'c', 'e', 'd']);
  });

  it('wrong-queue entries always come first even when others are unpracticed', () => {
    const progress = { c: inWrongQueue('c') };
    const batch = buildBatch(entries, 5, progress, Date.now());
    // c (wrong) first, then unpracticed a, b, d, e in workbook order.
    expect(batch.map((e) => e.entryId)).toEqual(['c', 'a', 'b', 'd', 'e']);
  });

  it('due entries rank above unpracticed ones', () => {
    const progress = { b: due('b') };
    const batch = buildBatch(entries, 5, progress, Date.now());
    expect(batch.map((e) => e.entryId)).toEqual(['b', 'a', 'c', 'd', 'e']);
  });

  it('fills the batch with the rest once higher-priority groups are exhausted', () => {
    // Every entry has progress; a and b are due, c/d/e practiced-not-due.
    const progress = {
      a: due('a'),
      b: due('b'),
      c: practiced('c'),
      d: practiced('d'),
      e: practiced('e'),
    };
    const batch = buildBatch(entries, 5, progress, Date.now());
    expect(batch.map((e) => e.entryId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('caps the batch at batchSize while preserving the priority order', () => {
    const many = [
      entry('a'),
      entry('b'),
      entry('c'),
      entry('d'),
      entry('e'),
      entry('f'),
      entry('g'),
      entry('h'),
    ];
    const progress = {
      a: inWrongQueue('a'),
      b: due('b'),
    };
    // a (wrong), b (due), then unpracticed c, d, e in workbook order; capped at 5.
    const batch = buildBatch(many, 5, progress, Date.now());
    expect(batch.map((e) => e.entryId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps workbook order within each group', () => {
    // c is wrong, a is wrong too → wrong group in workbook order a, c.
    const progress = {
      c: inWrongQueue('c'),
      a: inWrongQueue('a'),
    };
    const batch = buildBatch(entries, 5, progress, Date.now());
    expect(batch.map((e) => e.entryId)).toEqual(['a', 'c', 'b', 'd', 'e']);
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

  it('review mode returns due entries but not future ones (P0-1)', () => {
    const entries = [entry('a'), entry('b'), entry('c')];
    const now = Date.now();
    const progress = {
      a: due('a'), // overdue
      b: practiced('b'), // not due yet
    };
    const result = filterEntries(
      entries,
      progress,
      { mode: 'review' },
      false,
      now,
    );
    expect(result.map((e) => e.entryId)).toEqual(['a']);
  });

  it('review mode with empty progress returns nothing', () => {
    const result = filterEntries(
      [entry('a')],
      {},
      { mode: 'review' },
      false,
      Date.now(),
    );
    expect(result).toEqual([]);
  });
});
