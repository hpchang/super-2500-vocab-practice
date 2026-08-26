import { describe, it, expect, afterEach } from 'vitest';
import { isSpeechSupported, speak, warmUpVoices } from '../src/lib/speak.js';

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
        getVoices: () => [],
        onvoiceschanged: null,
      },
    };
    expect(isSpeechSupported()).toBe(true);
    // speak should work without error even with no voices configured.
    expect(() => speak('hello')).not.toThrow();
  });
});