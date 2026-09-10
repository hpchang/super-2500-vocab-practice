import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPlan,
  savePlan,
  removePlan,
  corpusMatches,
  PLAN_STORAGE_KEY,
} from '../src/lib/studyPlanStorage.js';
import {
  buildCorpus,
  createPlan,
  corpusFingerprint,
} from '../src/lib/studyPlan.js';
import { emptyProgress } from '../src/lib/storage.js';
import type { StudyPlan } from '../src/types/index.js';

function makeStore() {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
}

const now = new Date(2026, 8, 10, 10, 0).getTime();

function makePlan(): StudyPlan {
  return createPlan({
    startDate: '2026-09-10',
    corpus: buildCorpus(),
    progress: emptyProgress(),
    now,
  });
}

describe('studyPlanStorage', () => {
  beforeEach(() => {
    const store = makeStore();
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: store },
      writable: true,
      configurable: true,
    });
  });

  it('save then load round-trips the plan', () => {
    const plan = makePlan();
    expect(savePlan(plan)).toBe(true);
    const loaded = loadPlan();
    expect(loaded).not.toBeNull();
    expect(loaded!.planId).toBe(plan.planId);
    expect(loaded!.endDate).toBe(plan.endDate);
    expect(loaded!.corpus.entryIds).toEqual(plan.corpus.entryIds);
  });

  it('no plan saved returns null', () => {
    expect(loadPlan()).toBeNull();
  });

  it('malformed JSON falls back to null', () => {
    (globalThis as any).window.localStorage.setItem(PLAN_STORAGE_KEY, 'not json{{');
    expect(loadPlan()).toBeNull();
  });

  it('plan with wrong schemaVersion is rejected', () => {
    const plan = makePlan() as unknown as Record<string, unknown>;
    plan.schemaVersion = 999;
    (globalThis as any).window.localStorage.setItem(
      PLAN_STORAGE_KEY,
      JSON.stringify(plan),
    );
    expect(loadPlan()).toBeNull();
  });

  it('plan with missing required fields is rejected', () => {
    const plan = makePlan();
    const broken: Record<string, unknown> = { ...plan, endDate: undefined };
    (globalThis as any).window.localStorage.setItem(
      PLAN_STORAGE_KEY,
      JSON.stringify(broken),
    );
    expect(loadPlan()).toBeNull();
  });

  it('plan with malformed today snapshot is rejected', () => {
    const plan = makePlan();
    const broken = {
      ...plan,
      today: { date: 'bad-date', day: 0, newEntries: 'nope' },
    };
    (globalThis as any).window.localStorage.setItem(
      PLAN_STORAGE_KEY,
      JSON.stringify(broken),
    );
    expect(loadPlan()).toBeNull();
  });

  it('plan with valid today snapshot passes validation', () => {
    const plan = makePlan();
    const withToday: StudyPlan = {
      ...plan,
      today: {
        day: 1,
        date: '2026-09-10',
        newEntries: [{ unit: '1', entryIds: ['u1:a'] }],
        requiredReview: [],
        optionalStrong: [],
      },
    };
    savePlan(withToday);
    const loaded = loadPlan();
    expect(loaded?.today?.newEntries[0].unit).toBe('1');
  });

  it('removePlan wipes storage', () => {
    const plan = makePlan();
    savePlan(plan);
    removePlan();
    expect(loadPlan()).toBeNull();
  });

  it('works without window (no crash)', () => {
    delete (globalThis as any).window;
    expect(loadPlan()).toBeNull();
    expect(savePlan(makePlan())).toBe(false);
    expect(() => removePlan()).not.toThrow();
  });
});

describe('corpus compatibility', () => {
  it('matches when fingerprints equal, differs otherwise', () => {
    const plan = makePlan();
    expect(corpusMatches(plan, buildCorpus())).toBe(true);
    const modified = buildCorpus();
    const smaller = {
      ...modified,
      entryIds: modified.entryIds.slice(1),
    };
    expect(corpusMatches(plan, smaller)).toBe(false);
    expect(corpusFingerprint(smaller)).not.toBe(corpusFingerprint(modified));
  });
});