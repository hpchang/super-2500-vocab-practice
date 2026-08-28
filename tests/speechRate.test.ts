// @vitest-environment jsdom
/**
 * P2-2 — speech rate preference.
 *
 * Covers:
 *  - speakNow applies the persisted rate to the utterance
 *  - changing prefs via updatePrefs takes effect on the next utterance
 *  - an invalid stored rate falls back to the default (0.9) on load
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { speakNow } from '../src/lib/speak.js';
import { getPrefs, updatePrefs } from '../src/prefs.js';

type Captured = { text: string; rate: number };

function installSpeechStub(): Captured[] {
  const captured: Captured[] = [];
  class FakeUtterance {
    text: string;
    lang = '';
    rate = 1;
    pitch = 1;
    voice: unknown = null;
    onstart: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  (globalThis as any).SpeechSynthesisUtterance = FakeUtterance;
  // Patch the EXISTING jsdom window — replacing it wholesale would drop the
  // non-enumerable storage accessors installed by tests/setup.ts.
  (window as any).speechSynthesis = {
    speak: (u: FakeUtterance) => captured.push({ text: u.text, rate: u.rate }),
    cancel: () => {},
    resume: () => {},
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => [],
    onvoiceschanged: null,
  };
  return captured;
}

describe('speech rate preference (P2-2)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    updatePrefs({ speechRate: 0.9, speechAutoplay: true });
  });

  afterEach(() => {
    window.localStorage.clear();
    delete (globalThis as any).SpeechSynthesisUtterance;
  });

  it('defaults to 0.9 (slightly slow for learners)', () => {
    expect(getPrefs().speechRate).toBe(0.9);
  });

  it('speakNow applies the current rate to the utterance', () => {
    const captured = installSpeechStub();
    updatePrefs({ speechRate: 0.6 });
    speakNow('apartment');
    expect(captured).toHaveLength(1);
    expect(captured[0].rate).toBe(0.6);
  });

  it('rate changes take effect on subsequent utterances', () => {
    const captured = installSpeechStub();
    updatePrefs({ speechRate: 1.3 });
    speakNow('slow');
    updatePrefs({ speechRate: 0.6 });
    speakNow('fast');
    expect(captured.map((c) => c.rate)).toEqual([1.3, 0.6]);
  });

  it('an invalid stored rate falls back to 0.9 on load', async () => {
    window.localStorage.setItem(
      'vocab-super2500-prefs',
      JSON.stringify({ schema: 1, speechRate: 99 }),
    );
    // Re-evaluate the prefs module so it re-runs load() against storage.
    vi.resetModules();
    const fresh = await import('../src/prefs.js');
    expect(fresh.getPrefs().speechRate).toBe(0.9);
  });

  it('a valid stored rate is restored on load', async () => {
    window.localStorage.setItem(
      'vocab-super2500-prefs',
      JSON.stringify({ schema: 1, speechRate: 0.6 }),
    );
    vi.resetModules();
    const fresh = await import('../src/prefs.js');
    expect(fresh.getPrefs().speechRate).toBe(0.6);
  });
});