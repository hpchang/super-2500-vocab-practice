import { describe, it, expect, beforeEach } from 'vitest';
import {
  emptyProgress,
  loadProgress,
  saveProgress,
  setEntryProgress,
  getEntryProgress,
  clearProgress,
  CURRENT_SCHEMA,
} from '../src/lib/storage.js';
import { makeInitialProgress } from '../src/lib/scheduler.js';
import type { ProgressData } from '../src/types/index.js';

// Minimal localStorage mock so the storage adapter works in node env.
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

describe('storage', () => {
  beforeEach(() => {
    const store = makeStore();
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: store },
      writable: true,
      configurable: true,
    });
  });

  it('emptyProgress has current schema and no entries', () => {
    const p = emptyProgress();
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(Object.keys(p.entries)).toHaveLength(0);
  });

  it('save then load round-trips progress', () => {
    let data = emptyProgress();
    data = setEntryProgress(
      data,
      'u11:bed',
      makeInitialProgress('u11:bed'),
    );
    saveProgress(data);
    const loaded = loadProgress();
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(loaded.entries['u11:bed']).toBeDefined();
    expect(loaded.entries['u11:bed'].stage).toBe('new');
  });

  it('getEntryProgress returns a default when missing', () => {
    const data = emptyProgress();
    const p = getEntryProgress(data, 'u11:bed');
    expect(p.entryId).toBe('u11:bed');
    expect(p.stage).toBe('new');
  });

  it('corrupted data falls back to empty progress', () => {
    (globalThis as any).window.localStorage.setItem(
      'vocab-super2500-progress',
      'not json{{',
    );
    const p = loadProgress();
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(Object.keys(p.entries)).toHaveLength(0);
  });

  it('old/wrong-schema data is migrated to current schema keeping entries', () => {
    const old: ProgressData = {
      schemaVersion: 0,
      entries: { 'u11:bed': makeInitialProgress('u11:bed') },
    };
    (globalThis as any).window.localStorage.setItem(
      'vocab-super2500-progress',
      JSON.stringify(old),
    );
    const p = loadProgress();
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(p.entries['u11:bed']).toBeDefined();
  });

  it('clearProgress wipes storage and returns empty', () => {
    let data = emptyProgress();
    data = setEntryProgress(data, 'u11:bed', makeInitialProgress('u11:bed'));
    saveProgress(data);
    const after = clearProgress();
    expect(Object.keys(after.entries)).toHaveLength(0);
    const loaded = loadProgress();
    expect(Object.keys(loaded.entries)).toHaveLength(0);
  });

  it('works without window (no crash)', () => {
    delete (globalThis as any).window;
    const p = loadProgress();
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(() => saveProgress(emptyProgress())).not.toThrow();
  });
});