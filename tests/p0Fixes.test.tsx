// @vitest-environment jsdom
/**
 * P0-2 / P0-3 / P0-7 / P0-9 acceptance tests.
 *
 * - P0-2: Home「繼續學習」must target a unit that actually has due/wrong
 *   work (not always Unit 11) and deep-link the matching filter.
 * - P0-9: blocked or malformed session storage must not crash — loadSession /
 *   loadResult return null instead of throwing uncaught errors.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { HomeScreen } from '../src/screens/HomeScreen.js';
import {
  loadSession,
  loadResult,
  saveSession,
  saveResult,
} from '../src/session.js';
import { resetProgress } from '../src/progressStore.js';
import { updateEntryProgress } from '../src/progressStore.js';
import { recordAnswer } from '../src/lib/scheduler.js';
import { getUnit } from '../src/lib/data.js';
import type { SessionConfig, SessionResult } from '../src/session.js';

describe('session storage safety (P0-9)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('round-trips a valid session config', () => {
    const cfg: SessionConfig = {
      unit: '11',
      entryIds: ['u11:bed'],
      type: 'cloze',
      batchSize: 10,
      difficulty: 'hard',
    };
    expect(saveSession(cfg)).toBe(true);
    expect(loadSession()).toEqual(cfg);
  });

  it('round-trips a valid session result including difficulty (P0-7)', () => {
    const result: SessionResult = {
      unit: '12',
      type: 'cloze',
      difficulty: 'hard',
      results: [{ entryId: 'u12:x', type: 'cloze', correct: true }],
    };
    expect(saveResult(result)).toBe(true);
    expect(loadResult()).toEqual(result);
  });

  it('returns null for malformed JSON', () => {
    window.sessionStorage.setItem('vocab-super2500-session', 'not json{{');
    expect(loadSession()).toBeNull();
    window.sessionStorage.setItem('vocab-super2500-lastresult', '{oops');
    expect(loadResult()).toBeNull();
  });

  it('returns null when fields have wrong types', () => {
    window.sessionStorage.setItem(
      'vocab-super2500-session',
      JSON.stringify({ unit: 11, entryIds: 'x', type: 'cloze', batchSize: 10 }),
    );
    expect(loadSession()).toBeNull();

    window.sessionStorage.setItem(
      'vocab-super2500-session',
      JSON.stringify({
        unit: '11',
        entryIds: ['u11:bed'],
        type: 'telepathy', // invalid question type
        batchSize: 10,
      }),
    );
    expect(loadSession()).toBeNull();

    window.sessionStorage.setItem(
      'vocab-super2500-lastresult',
      JSON.stringify({
        unit: '11',
        type: 'mixed',
        results: [{ entryId: 'u11:bed', type: 'cloze', correct: 'yes' }],
      }),
    );
    expect(loadResult()).toBeNull();
  });

  it('does not crash when storage is blocked', () => {
    // jsdom's Storage methods aren't always patchable per-instance; replace
    // the whole storage object with one that throws (privacy-mode simulation).
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    const blocked = {
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      removeItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      clear: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    Object.defineProperty(window, 'sessionStorage', {
      value: blocked,
      configurable: true,
    });

    expect(() =>
      saveSession({ unit: '11', entryIds: [], type: 'mixed', batchSize: 10 }),
    ).not.toThrow();
    expect(
      saveSession({ unit: '11', entryIds: [], type: 'mixed', batchSize: 10 }),
    ).toBe(false);
    expect(() => loadSession()).not.toThrow();
    expect(loadSession()).toBeNull();

    if (original) Object.defineProperty(window, 'sessionStorage', original);
  });
});

describe('HomeScreen 繼續學習 targeting (P0-2)', () => {
  beforeEach(() => {
    resetProgress();
  });

  afterEach(() => {
    resetProgress();
    document.body.innerHTML = '';
  });

  it('deep-links the unit that has due work, with the review filter', async () => {
    // Make exactly one U12 entry due (nothing in U11).
    const u12 = getUnit('12')!;
    const target = u12.entries[0].entryId;
    updateEntryProgress(target, (prev) =>
      recordAnswer(prev, true, 'cloze', Date.now() - 4 * 24 * 60 * 60 * 1000),
    );

    let lastNav: string | null = null;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <HomeScreen navigate={(to: string) => (lastNav = to)} />,
      );
    });

    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('繼續學習'),
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);

    await act(async () => {
      btn.click();
    });
    expect(lastNav).toBe(`/unit/12/setup/mixed/review`);

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps 繼續學習 disabled when nothing is due or wrong', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<HomeScreen navigate={() => {}} />);
    });

    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('繼續學習'),
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});

describe('batchSize slice (P0-3)', () => {
  it('a session with more entryIds than batchSize only renders batchSize questions', async () => {
    const { PracticeScreen } = await import(
      '../src/screens/PracticeScreen.js'
    );
    const unit = getUnit('11')!;
    const ids = unit.entries.slice(0, 30).map((e) => e.entryId);
    saveSession({
      unit: '11',
      entryIds: ids,
      type: 'flashcard',
      batchSize: 10,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<PracticeScreen navigate={() => {}} />);
    });

    const meta = document.querySelector('.qmeta span')?.textContent ?? '';
    expect(meta).toContain('1 / 10');

    await act(async () => {
      root.unmount();
    });
  });
});