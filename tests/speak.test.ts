import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isSpeechSupported,
  speak,
  speakRepeatedly,
  warmUpVoices,
} from '../src/lib/speak.js';

describe('speak (text-to-speech)', () => {
  afterEach(() => {
    // Ensure no global window leaks between tests.
    delete (globalThis as any).window;
  });

  it('isSpeechSupported is false in a node environment without window', () => {
    delete (globalThis as any).window;
    expect(isSpeechSupported()).toBe(false);
  });

  it('speak does not throw when speechSynthesis is unavailable', () => {
    delete (globalThis as any).window;
    expect(() => speak('apartment')).not.toThrow();
  });

  it('warmUpVoices does not throw without window', () => {
    delete (globalThis as any).window;
    expect(() => warmUpVoices()).not.toThrow();
  });

  it('isSpeechSupported is true when window.speechSynthesis.speak exists', () => {
    // Stub the utterance constructor the browser would normally provide.
    (globalThis as any).SpeechSynthesisUtterance = class {
      text: string;
      lang: string;
      rate: number;
      pitch: number;
      voice: unknown;
      constructor(text: string) {
        this.text = text;
        this.lang = '';
        this.rate = 1;
        this.pitch = 1;
        this.voice = null;
      }
    };
    (globalThis as any).window = {
      speechSynthesis: {
        speak: () => {},
        cancel: () => {},
        resume: () => {},
        speaking: false,
        pending: false,
        paused: false,
        getVoices: () => [],
        onvoiceschanged: null,
      },
    };
    expect(isSpeechSupported()).toBe(true);
    // speak should work without error even with no voices configured.
    expect(() => speak('hello')).not.toThrow();
  });

  describe('speakRepeatedly', () => {
    type SpeakCall = { text: string; onend: (() => void) | null };
    let calls: SpeakCall[];

    const installSynth = () => {
      calls = [];
      (globalThis as any).SpeechSynthesisUtterance = class {
        text: string;
        lang: string;
        rate: number;
        pitch: number;
        voice: unknown;
        onend: (() => void) | null;
        onstart: (() => void) | null;
        onerror: (() => void) | null;
        constructor(text: string) {
          this.text = text;
          this.lang = '';
          this.rate = 1;
          this.pitch = 1;
          this.voice = null;
          this.onend = null;
          this.onstart = null;
          this.onerror = null;
          calls.push({ text, onend: null });
          // Keep the shared record pointing at the live utterance so tests
          // can fire its onend.
          calls[calls.length - 1].onend = () => {
            this.onend?.();
          };
        }
      };
      (globalThis as any).window = {
        speechSynthesis: {
          speak: (u: SpeechSynthesisUtterance) => {
            // Simulate async playback: onend fires on a later tick.
            setTimeout(() => (u as any).onend?.(), 0);
          },
          cancel: () => {},
          resume: () => {},
          speaking: false,
          pending: false,
          paused: false,
          getVoices: () => [],
          onvoiceschanged: null,
        },
      };
    };

    const flush = async (ticks: number) => {
      for (let i = 0; i < ticks; i++) await vi.advanceTimersByTimeAsync(500);
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    it('speaks the word 3 times, chained via onend', async () => {
      vi.useFakeTimers();
      installSynth();
      speakRepeatedly('apartment', 3);
      await flush(10);
      expect(calls.map((c) => c.text)).toEqual([
        'apartment',
        'apartment',
        'apartment',
      ]);
    });

    it('falls back to a single speak when times <= 1', async () => {
      vi.useFakeTimers();
      installSynth();
      speakRepeatedly('apple', 1);
      await flush(5);
      expect(calls).toHaveLength(1);
    });

    it('a new speak() cancels the remaining repeats', async () => {
      vi.useFakeTimers();
      installSynth();
      speakRepeatedly('banana', 3);
      await flush(1); // first utterance done, second queued/spoken
      speak('cherry');
      await flush(10);
      const texts = calls.map((c) => c.text);
      expect(texts).toContain('cherry');
      expect(texts.filter((t) => t === 'banana').length).toBeLessThan(3);
      expect(texts[texts.length - 1]).toBe('cherry');
    });
  });
});