import { describe, it, expect, beforeEach, vi } from 'vitest';

// P1 review (2026-08-29) regression tests — concurrent-tab progress.
// Two tabs each keep a module-level snapshot; without merge-on-write or a
// storage listener, tab B writing from its stale snapshot permanently
// drops tab A's answers.

const STORAGE_KEY = 'vocab-super2500-progress';

function makeStore() {
  let store: Record<string, string> = {};
  const listeners: ((e: StorageEvent) => void)[] = [];
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
       // Storage events fire in OTHER tabs only; our "other tab" is
       // simulated by calling listeners manually.
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

async function freshStore() {
  store = makeStore();
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: store, addEventListener: () => {} },
    writable: true,
    configurable: true,
  });
  const mod = await import('../src/progressStore.js');
  return mod;
}

describe('concurrent-tab progress merge', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('merges another tab entry instead of clobbering on update', async () => {
    let mod = await freshStore();

    // Tab B's snapshot was taken when storage was empty…
    expect(Object.keys(mod.getSnapshot().entries)).toHaveLength(0);

    // …meanwhile tab A writes directly to storage (simulated other tab).
    store.setRaw(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        entries: {
          'u11:aaa': {
            entryId: 'u11:aaa',
            stage: 'learning',
            totalAnswered: 1,
            totalCorrect: 1,
            totalWrong: 0,
            streak: 1,
            lastAnsweredAt: 1000,
            nextReviewAt: 999000,
            inWrongQueue: false,
            lastWrongType: null,
            wrongCount: 0,
          },
        },
      }),
    );

    // Tab B answers a DIFFERENT word. Its local save must not drop A's.
    mod.updateEntryProgress('u11:bbb', (prev) => ({
      ...prev,
      entryId: 'u11:bbb',
      totalAnswered: 1,
      totalCorrect: 0,
      totalWrong: 1,
      lastAnsweredAt: 1100,
      inWrongQueue: true,
    }));

    const saved = JSON.parse(store.peek()[STORAGE_KEY]);
    // A's answer survives B's write, and B's answer is present too.
    expect(saved.entries['u11:aaa']).toBeDefined();
    expect(saved.entries['u11:bbb']).toBeDefined();
    mod = mod; // keep reference
  });
});