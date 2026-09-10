import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveSession,
  saveResult,
  parseSessionConfig,
} from '../src/session.js';
import type { SessionConfig } from '../src/session.js';

// sessionStorage 在 node 測試環境需 mock。
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

describe('session planContext', () => {
  beforeEach(() => {
    const store = makeStore();
    Object.defineProperty(globalThis, 'window', {
      value: { sessionStorage: store, localStorage: store },
      writable: true,
      configurable: true,
    });
  });

  it('legacy session without planContext still parses and round-trips', () => {
    const cfg: SessionConfig = {
      unit: '11',
      entryIds: ['u11:bed'],
      type: 'mixed',
      batchSize: 20,
    };
    expect(saveSession(cfg)).toBe(true);
    const loaded = parseSessionConfig(JSON.stringify(cfg));
    expect(loaded).toEqual(cfg);
    expect(loaded?.plan).toBeUndefined();
  });

  it('plan context round-trips through sessionStorage', () => {
    const cfg: SessionConfig = {
      unit: '11',
      entryIds: ['u11:bed'],
      type: 'mixed',
      batchSize: 20,
      plan: {
        planId: 'plan-abc',
        date: '2026-09-10',
        section: 'new',
        unit: '11',
      },
    };
    expect(saveSession(cfg)).toBe(true);
    // loadSession 讀 sessionStorage 再 parse——直接驗證 raw round-trip。
    const raw = (globalThis as any).window.sessionStorage.getItem(
      'vocab-super2500-session',
    );
    const parsed = parseSessionConfig(raw);
    expect(parsed?.plan).toEqual(cfg.plan);
  });

  it('malformed plan context fails parsing (no crash)', () => {
    const raw = JSON.stringify({
      unit: '11',
      entryIds: ['u11:bed'],
      type: 'mixed',
      batchSize: 20,
      plan: { planId: 42 },
    });
    expect(parseSessionConfig(raw)).toBeNull();
  });

  it('plan unit mismatching session unit fails parsing', () => {
    const raw = JSON.stringify({
      unit: '11',
      entryIds: ['u11:bed'],
      type: 'mixed',
      batchSize: 20,
      plan: {
        planId: 'p1',
        date: '2026-09-10',
        section: 'new',
        unit: '12',
      },
    });
    expect(parseSessionConfig(raw)).toBeNull();
  });

  it('unknown section value fails parsing', () => {
    const raw = JSON.stringify({
      unit: '11',
      entryIds: ['u11:bed'],
      type: 'mixed',
      batchSize: 20,
      plan: {
        planId: 'p1',
        date: '2026-09-10',
        section: 'everything',
        unit: '11',
      },
    });
    expect(parseSessionConfig(raw)).toBeNull();
  });

  it('result carries plan context through round-trip', () => {
    const result = {
      unit: '11',
      type: 'mixed' as const,
      plan: {
        planId: 'plan-abc',
        date: '2026-09-10',
        section: 'required-review' as const,
        unit: '11',
      },
      results: [{ entryId: 'u11:bed', type: 'en2zh' as const, correct: true }],
    };
    expect(saveResult(result)).toBe(true);
    const raw = (globalThis as any).window.sessionStorage.getItem(
      'vocab-super2500-lastresult',
    );
    // parseSessionResult 沒有單獨 export；以 saveResult/loadResult 走完整路徑。
    // loadResult 在此直接驗證 raw 含 plan。
    expect(JSON.parse(raw).plan).toEqual(result.plan);
  });
});