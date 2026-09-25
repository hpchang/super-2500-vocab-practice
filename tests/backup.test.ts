import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * I-13 guards — 匯入必須合併、不得覆蓋；外部檔案必須驗證。
 *
 * These go through the real stores (`progressStore`, `studyPlanStore`),
 * because the behaviour under test is the store-level merge. A pure test
 * of `mergeProgressData` alone would not catch a store that OVERWRITES
 * instead of merging — the failure mode I-13 exists to prevent.
 *
 * Both stores hydrate at import time, so every case seeds storage first
 * and then re-imports under `vi.resetModules()`.
 */

const PLAN_KEY = 'vocab-super2500-study-plan';

function makeStore() {
  let store: Record<string, string> = {};
  const listeners: ((e: StorageEvent) => void)[] = [];
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
      for (const l of listeners) {
        l({ key: k, newValue: v, storageArea: store } as StorageEvent);
      }
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    addStorageListener: (l: (e: StorageEvent) => void) => listeners.push(l),
    peek: () => store,
    setRaw: (k: string, v: string) => {
      store[k] = v;
    },
  };
}

let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  vi.resetModules();
  store = makeStore();
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: store,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    writable: true,
    configurable: true,
  });
  (globalThis as any).sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };
});

/** Fresh imports after the seed is in place. */
async function loadModules() {
  const storage = await import('../src/lib/storage.js');
  const progressStore = await import('../src/progressStore.js');
  const studyPlanStore = await import('../src/studyPlanStore.js');
  const history = await import('../src/lib/history.js');
  const backup = await import('../src/lib/backup.js');
  return { storage, progressStore, studyPlanStore, history, backup };
}

function entry(id: string, at: number | null, over: Record<string, unknown> = {}) {
  return {
    entryId: id,
    stage: 'learning',
    totalAnswered: 1,
    totalCorrect: 1,
    totalWrong: 0,
    streak: 1,
    lastAnsweredAt: at,
    nextReviewAt: 999000,
    inWrongQueue: false,
    lastWrongType: null,
    wrongCount: 0,
    ...over,
  };
}

function planWith(days: any[], over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    planId: 'plan-x',
    status: 'active',
    startDate: '2026-09-01',
    endDate: '2026-11-29',
    tzOffset: -480,
    corpus: { entryIds: ['a', 'b'], unitTotals: { '1': 2 } },
    baselineIntroduced: 0,
    today: null,
    days,
    ...over,
  };
}

function backupFile(progress: any, plan: any = null, history: any[] = []) {
  return JSON.stringify({
    format: 'vocab-super2500-backup',
    formatVersion: 1,
    exportedAt: 9999,
    progress,
    plan,
    history,
  });
}

describe('progress import merge (I-13)', () => {
  it('NEVER overwrites: importing a file from another device keeps both sides', async () => {
    store.setRaw(
      'vocab-super2500-progress',
      JSON.stringify({
        schemaVersion: 1,
        entries: { 'u11:ankle': entry('u11:ankle', 5000, { totalAnswered: 2 }) },
      }),
    );
    const { progressStore, backup } = await loadModules();

    // Device B's file has a DIFFERENT word only.
    const parsed = backup.parseBackup(
      backupFile({
        schemaVersion: 1,
        entries: { 'u11:knee': entry('u11:knee', 4000) },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const res = progressStore.applyImportedProgress(parsed.payload.progress);

    const saved = progressStore.getSnapshot();
    expect(saved.entries['u11:ankle']).toBeDefined(); // A survives B's import
    expect(saved.entries['u11:knee']).toBeDefined(); // B's word arrives
    expect(res.added).toBe(1);
    expect(res.updated).toBe(0);
  });

  it('takes the newer lastAnsweredAt for the same word', async () => {
    store.setRaw(
      'vocab-super2500-progress',
      JSON.stringify({
        schemaVersion: 1,
        entries: { 'u11:ankle': entry('u11:ankle', 9000, { totalAnswered: 9 }) },
      }),
    );
    const { progressStore, backup } = await loadModules();

    const older = backup.parseBackup(
      backupFile({
        schemaVersion: 1,
        entries: { 'u11:ankle': entry('u11:ankle', 1000, { totalAnswered: 1 }) },
      }),
    );
    if (!older.ok) throw new Error('bad fixture');
    progressStore.applyImportedProgress(older.payload.progress);
    expect(progressStore.getSnapshot().entries['u11:ankle'].totalAnswered).toBe(9);

    const newer = backup.parseBackup(
      backupFile({
        schemaVersion: 1,
        entries: { 'u11:ankle': entry('u11:ankle', 12000, { totalAnswered: 12 }) },
      }),
    );
    if (!newer.ok) throw new Error('bad fixture');
    const res = progressStore.applyImportedProgress(newer.payload.progress);
    expect(progressStore.getSnapshot().entries['u11:ankle'].totalAnswered).toBe(12);
    expect(res.updated).toBe(1);
  });

  it('clears a stale resume checkpoint on import', async () => {
    store.setRaw('vocab-super2500-checkpoint', JSON.stringify({ anything: true }));
    const { progressStore, backup } = await loadModules();
    const parsed = backup.parseBackup(
      backupFile({ schemaVersion: 1, entries: {} }),
    );
    if (!parsed.ok) throw new Error('bad fixture');
    progressStore.applyImportedProgress(parsed.payload.progress);
    expect(store.peek()['vocab-super2500-checkpoint']).toBeUndefined();
  });
});

describe('backup file validation (I-13)', () => {
  it('rejects non-JSON, wrong format and an unknown version', async () => {
    const { backup } = await loadModules();
    expect(backup.parseBackup('not json{{').ok).toBe(false);
    expect(backup.parseBackup('[]').ok).toBe(false);
    expect(
      backup.parseBackup(JSON.stringify({ format: 'other', formatVersion: 1 })).ok,
    ).toBe(false);
    expect(
      backup.parseBackup(
        JSON.stringify({ format: backup.BACKUP_FORMAT, formatVersion: 99 }),
      ).ok,
    ).toBe(false);
  });

  it('drops malformed entries but keeps the good ones', async () => {
    const { backup } = await loadModules();
    const parsed = backup.parseBackup(
      backupFile({
        schemaVersion: 1,
        entries: {
          'u11:good': entry('u11:good', 1000),
          'u11:bad': { entryId: 'u11:bad', stage: 'nonsense' },
          'u11:null': null,
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.payload.progress.entries)).toEqual(['u11:good']);
  });

  it('drops an invalid plan rather than letting it into the store', async () => {
    const { backup } = await loadModules();
    const parsed = backup.parseBackup(
      backupFile({ schemaVersion: 1, entries: {} }, {
        schemaVersion: 999,
        nonsense: true,
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.plan).toBeNull();
  });

  it('round-trips a full export without loss', async () => {
    store.setRaw(
      'vocab-super2500-progress',
      JSON.stringify({
        schemaVersion: 1,
        entries: { 'u11:ankle': entry('u11:ankle', 5000, { totalAnswered: 3 }) },
      }),
    );
    store.setRaw('vocab-super2500-history', JSON.stringify([
      { schema: 1, at: 1000, unit: '11', type: 'mixed', total: 5, correct: 4 },
    ]));
    const { progressStore, studyPlanStore, history, backup } = await loadModules();

    const payload = backup.buildBackup({
      progress: progressStore.getSnapshot(),
      plan: studyPlanStore.getPlanSnapshot(),
      history: history.loadHistory(),
      now: 9000,
    });
    const parsed = backup.parseBackup(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.progress.entries['u11:ankle'].totalAnswered).toBe(3);
    expect(parsed.payload.history).toHaveLength(1);
    expect(backup.summarizeBackup(parsed.payload).words).toBe(1);
    expect(backup.backupFilename(0)).toMatch(
      /^vocab-super2500-backup-\d{4}-\d{2}-\d{2}\.json$/,
    );
  });
});

describe('plan day merge (I-13)', () => {
  it('merges a same-identity plan field by field', async () => {
    store.setRaw(
      PLAN_KEY,
      JSON.stringify(
        planWith([
          {
            date: '2026-09-02',
            day: 2,
            newCount: 5,
            reviewCount: 3,
            completed: false,
            answered: 4,
            correct: 3,
          },
        ]),
      ),
    );
    const { studyPlanStore, backup } = await loadModules();
    const parsed = backup.parseBackup(
      backupFile({ schemaVersion: 1, entries: {} }, planWith([
        {
          date: '2026-09-02',
          day: 2,
          newCount: 8,
          reviewCount: 2,
          completed: true,
          answered: 6,
          correct: 5,
        },
        {
          date: '2026-09-03',
          day: 3,
          newCount: 1,
          reviewCount: 0,
          completed: false,
          answered: 2,
          correct: 2,
        },
      ])),
    );
    if (!parsed.ok) throw new Error('bad fixture');

    const stats = studyPlanStore.applyImportedPlan(parsed.payload.plan);
    expect(stats.outcome).toBe('merged');
    expect(stats.daysMerged).toBe(1);
    expect(stats.daysAdded).toBe(1);

    const day2 = parsed.payload.plan!.days[0];
    expect(day2.date).toBe('2026-09-02');
    const saved = JSON.parse(store.peek()[PLAN_KEY]);
    const merged = saved.days.find((d: any) => d.date === '2026-09-02');
    expect(merged.answered).toBe(10); // 4 + 6 — the only true counters
    expect(merged.correct).toBe(8); // 3 + 5
    expect(merged.newCount).toBe(8); // max(5, 8) — an absolute value, not summed
    expect(merged.reviewCount).toBe(3); // max(3, 2)
    expect(merged.completed).toBe(true); // or
  });

  it('keeps the local plan when identities differ', async () => {
    store.setRaw(PLAN_KEY, JSON.stringify(planWith([])));
    const { studyPlanStore, backup } = await loadModules();
    const parsed = backup.parseBackup(
      backupFile({ schemaVersion: 1, entries: {} }, planWith([], {
        planId: 'plan-y',
        startDate: '2026-01-01',
      })),
    );
    if (!parsed.ok) throw new Error('bad fixture');
    const stats = studyPlanStore.applyImportedPlan(parsed.payload.plan);
    expect(stats.outcome).toBe('mismatch');
    expect(JSON.parse(store.peek()[PLAN_KEY]).planId).toBe('plan-x');
  });

  it('adopts the imported plan when there is no local one', async () => {
    const { studyPlanStore, backup } = await loadModules();
    expect(studyPlanStore.getPlanSnapshot()).toBeNull();
    const parsed = backup.parseBackup(
      backupFile({ schemaVersion: 1, entries: {} }, planWith([])),
    );
    if (!parsed.ok) throw new Error('bad fixture');
    const stats = studyPlanStore.applyImportedPlan(parsed.payload.plan);
    expect(stats.outcome).toBe('adopted');
    expect(studyPlanStore.getPlanSnapshot()?.planId).toBe('plan-x');
  });

  it('does not clobber the local today snapshot', async () => {
    const localToday = {
      day: 2,
      date: '2026-09-02',
      newEntries: [{ unit: '1', entryIds: ['localword'] }],
      requiredReview: [],
      optionalStrong: [],
    };
    store.setRaw(
      PLAN_KEY,
      JSON.stringify(planWith([], { today: localToday })),
    );
    const { studyPlanStore, backup } = await loadModules();
    const parsed = backup.parseBackup(
      backupFile({ schemaVersion: 1, entries: {} }, planWith([], {
        today: { ...localToday, newEntries: [{ unit: '1', entryIds: ['otherword'] }] },
      })),
    );
    if (!parsed.ok) throw new Error('bad fixture');
    studyPlanStore.applyImportedPlan(parsed.payload.plan);
    const saved = JSON.parse(store.peek()[PLAN_KEY]);
    expect(saved.today.newEntries[0].entryIds).toEqual(['localword']);
  });

  it('does nothing when the file has no plan', async () => {
    const { studyPlanStore } = await loadModules();
    const stats = studyPlanStore.applyImportedPlan(null);
    expect(stats.outcome).toBe('none');
    expect(studyPlanStore.getPlanSnapshot()).toBeNull();
  });
});

describe('history merge (I-13)', () => {
  it('unions by timestamp, dedupes and sorts', async () => {
    store.setRaw('vocab-super2500-history', JSON.stringify([
      { schema: 1, at: 1000, unit: '11', type: 'mixed', total: 5, correct: 4 },
    ]));
    const { history } = await loadModules();
    const added = history.applyImportedHistory([
      { schema: 1, at: 1000, unit: '11', type: 'mixed', total: 5, correct: 4 }, // dup
      { schema: 1, at: 500, unit: '12', type: 'cloze', total: 3, correct: 2 },
    ]);
    const all = history.loadHistory();
    expect(all.map((r) => r.at)).toEqual([500, 1000]);
    expect(added).toBe(1);
  });
});

describe('the student\'s real换機 flow never loses progress (I-13)', () => {
  // A 匯出 → B 匯入 → B 練 → B 匯出 → A 匯入。每一步之後，兩臺的「已練字數」
  // 只能單調增加，絕不倒退。這是這個功能存在的理由，逐字比對不覆蓋的
  // 單元測試之外，再把完整流程走一遍。
  it('grows monotonically through the whole A→B→A round trip', async () => {
    // Device A: practised two words.
    const A = makeStore();
    const aEntries: Record<string, any> = {
      'u11:ankle': entry('u11:ankle', 5000, { totalAnswered: 2 }),
      'u11:knee': entry('u11:knee', 6000, { totalAnswered: 1 }),
    };
    A.setRaw('vocab-super2500-progress', JSON.stringify({ schemaVersion: 1, entries: aEntries }));
    const countA = () => Object.keys(JSON.parse(A.peek()['vocab-super2500-progress']).entries).length;
    expect(countA()).toBe(2);

    // A exports.
    const exportFromA = A.peek()['vocab-super2500-progress'];

    // Device B starts empty, imports A's file.
    const B = makeStore();
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: B, addEventListener: () => {}, removeEventListener: () => {} },
      writable: true,
      configurable: true,
    });
    vi.resetModules();
    const bMods = await loadModules();
    const parsedA = bMods.backup.parseBackup(
      backupFile(JSON.parse(exportFromA)),
    );
    if (!parsedA.ok) throw new Error('bad fixture');
    bMods.progressStore.applyImportedProgress(parsedA.payload.progress);
    const countB = () =>
      Object.keys(
        JSON.parse(B.peek()['vocab-super2500-progress']).entries,
      ).length;
    expect(countB()).toBe(2); // B now has A's two words

    // B practises a NEW word.
    bMods.progressStore.updateEntryProgress('u12:guest', (p) => ({
      ...p,
      entryId: 'u12:guest',
      totalAnswered: 1,
      lastAnsweredAt: 7000,
    }));
    expect(countB()).toBe(3);

    // B exports; A imports that file back.
    const exportFromB = B.peek()['vocab-super2500-progress'];
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: A, addEventListener: () => {}, removeEventListener: () => {} },
      writable: true,
      configurable: true,
    });
    vi.resetModules();
    const aMods = await loadModules();
    const parsedB = aMods.backup.parseBackup(backupFile(JSON.parse(exportFromB)));
    if (!parsedB.ok) throw new Error('bad fixture');
    aMods.progressStore.applyImportedProgress(parsedB.payload.progress);

    // A now has all three — nothing was ever lost along the way.
    expect(countA()).toBe(3);
    expect(Object.keys(JSON.parse(A.peek()['vocab-super2500-progress']).entries).sort()).toEqual(
      ['u11:ankle', 'u11:knee', 'u12:guest'],
    );
  });
});
