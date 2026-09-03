// @vitest-environment jsdom
/**
 * P2-3 — practice history records and trend aggregation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadHistory,
  appendHistory,
  clearHistory,
  historyStats,
  historyDailySeries,
  countCompleted,
} from '../src/lib/history.js';
import { saveResult, saveSession, loadSession } from '../src/session.js';

const DAY = 24 * 60 * 60 * 1000;

describe('history records (P2-3)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts empty', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('appends records and persists them', () => {
    appendHistory({ at: 1000, unit: '11', type: 'cloze', total: 10, correct: 8 });
    appendHistory({ at: 2000, unit: '12', type: 'mixed', total: 5, correct: 5 });
    const h = loadHistory();
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ unit: '11', total: 10, correct: 8 });
    expect(h[1]).toMatchObject({ unit: '12', total: 5, correct: 5 });
  });

  it('caps stored records at 200 (oldest trimmed)', () => {
    for (let i = 0; i < 205; i++) {
      appendHistory({ at: i, unit: '11', type: 'mixed', total: 1, correct: 1 });
    }
    const h = loadHistory();
    expect(h).toHaveLength(200);
    expect(h[0].at).toBe(5); // oldest trimmed
  });

  it('corrupted storage falls back to empty', () => {
    window.localStorage.setItem('vocab-super2500-history', '{nope');
    expect(loadHistory()).toEqual([]);
  });

  it('drops records with invalid fields', () => {
    window.localStorage.setItem(
      'vocab-super2500-history',
      JSON.stringify([
        { schema: 1, at: 1000, unit: '11', type: 'cloze', total: 10, correct: 8 },
        { schema: 1, at: 1001, unit: '11', type: 'nonsense', total: 10, correct: 8 },
        { schema: 1, at: 1002, unit: '11', type: 'cloze', total: 5, correct: 9 },
        { schema: 1, at: 1003, unit: '11', type: 'cloze', total: -1, correct: 0 },
      ]),
    );
    const h = loadHistory();
    expect(h).toHaveLength(1);
    expect(h[0].at).toBe(1000);
  });

  it('clearHistory empties the store', () => {
    appendHistory({ at: 1000, unit: '11', type: 'mixed', total: 3, correct: 3 });
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });

  it('countCompleted counts per unit+type', () => {
    appendHistory({ at: 1000, unit: '11', type: 'mixed', total: 3, correct: 3 });
    appendHistory({ at: 1001, unit: '11', type: 'mixed', total: 3, correct: 2 });
    appendHistory({ at: 1002, unit: '11', type: 'cloze', total: 3, correct: 3 });
    appendHistory({ at: 1003, unit: '12', type: 'mixed', total: 3, correct: 3 });
    expect(countCompleted('11', 'mixed')).toBe(2);
    expect(countCompleted('11', 'cloze')).toBe(1);
    expect(countCompleted('12', 'mixed')).toBe(1);
    expect(countCompleted('13', 'mixed')).toBe(0);
  });

  it('session round round-trips; legacy sessions lack it; malformed is rejected', () => {
    saveSession({
      unit: '11',
      entryIds: ['u11:x'],
      type: 'mixed',
      batchSize: 5,
      round: 3,
    });
    expect(loadSession()!.round).toBe(3);

    // Legacy session (no round) parses fine — round stays undefined.
    window.sessionStorage.setItem(
      'vocab-super2500-session',
      JSON.stringify({ unit: '11', entryIds: ['u11:x'], type: 'mixed', batchSize: 5 }),
    );
    expect(loadSession()!.round).toBeUndefined();

    // A negative or non-integer round is malformed storage, not legacy.
    for (const bad of [-1, 1.5, 'x']) {
      window.sessionStorage.setItem(
        'vocab-super2500-session',
        JSON.stringify({ unit: '11', entryIds: ['u11:x'], type: 'mixed', batchSize: 5, round: bad }),
      );
      expect(loadSession()).toBeNull();
    }
  });
});

describe('saveResult appends history (P2-3)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('records a completed session once', () => {
    saveResult({
      unit: '11',
      type: 'cloze',
      results: [
        { entryId: 'u11:a', type: 'cloze', correct: true },
        { entryId: 'u11:b', type: 'cloze', correct: false },
        { entryId: 'u11:c', type: 'cloze', correct: true },
      ],
    });
    const h = loadHistory();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ unit: '11', type: 'cloze', total: 3, correct: 2 });
  });

  it('skips empty results', () => {
    saveResult({ unit: '11', type: 'mixed', results: [] });
    expect(loadHistory()).toEqual([]);
  });
});

describe('historyStats', () => {
  const now = Date.UTC(2026, 7, 28, 12);

  it('aggregates only records inside the window', () => {
    const records = [
      { schema: 1 as const, at: now - 1 * DAY, unit: '11', type: 'cloze' as const, total: 10, correct: 8 },
      { schema: 1 as const, at: now - 10 * DAY, unit: '12', type: 'mixed' as const, total: 5, correct: 4 },
      { schema: 1 as const, at: now - 40 * DAY, unit: '11', type: 'cloze' as const, total: 100, correct: 100 },
    ];
    const s = historyStats(records, now, 30);
    expect(s.sessions).toBe(2);
    expect(s.total).toBe(15);
    expect(s.correct).toBe(12);
    expect(s.accuracy).toBeCloseTo(0.8);
  });
});

describe('historyDailySeries', () => {
  it('buckets records per day, oldest first, empty days zeroed', () => {
    // Local noon anchors: day buckets start at local midnight.
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const t = now.getTime();
    const records = [
      { schema: 1 as const, at: t - 1 * DAY, unit: '11', type: 'cloze' as const, total: 10, correct: 8 },
      { schema: 1 as const, at: t - 1 * DAY + 1000, unit: '11', type: 'cloze' as const, total: 4, correct: 4 },
      { schema: 1 as const, at: t - 3 * DAY, unit: '12', type: 'mixed' as const, total: 5, correct: 1 },
    ];
    const series = historyDailySeries(records, t, 14);
    expect(series).toHaveLength(14);
    // Index 13 is today (empty), 12 is yesterday.
    expect(series[13].total).toBe(0);
    expect(series[12]).toMatchObject({ total: 14, correct: 12 });
    expect(series[10]).toMatchObject({ total: 5, correct: 1 });
    expect(series[0].total).toBe(0);
  });
});