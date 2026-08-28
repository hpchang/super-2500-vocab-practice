/** Browser text-to-speech wrapper around window.speechSynthesis. */

import { getPrefs } from '@/prefs';

export function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.speechSynthesis.speak === 'function'
  );
}

/** Prefer an English (ideally en-US) voice so words sound natural. */
function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // Prefer en-US, then any en-* voice.
  return (
    voices.find((v) => v.lang === 'en-US') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null
  );
}

let cachedVoice: SpeechSynthesisVoice | null = null;

/** Speak an English word/phrase once, canceling any in-flight utterance. */
export function speak(text: string): void {
  if (!isSpeechSupported()) return;
  // Respect the user's autoplay setting (P1-6); manual speaker buttons call
  // speakNow() directly so they always work.
  if (!getPrefs().speechAutoplay) return;
  speakNow(text);
}

/** Speak regardless of the autoplay preference — for explicit buttons. */
export function speakNow(text: string): void {
  if (!isSpeechSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel(); // stop overlapping speech
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9; // slightly slower for learners
  u.pitch = 1;
  if (!cachedVoice) cachedVoice = pickEnglishVoice();
  if (cachedVoice) u.voice = cachedVoice;
  synth.speak(u);
}

/**
 * Some browsers load voices asynchronously. Call once on mount so the
 * voice list is populated before the first speak() call.
 */
export function warmUpVoices(): void {
  if (!isSpeechSupported()) return;
  // Trigger voice loading; getVoices() may be empty until onvoiceschanged fires.
  window.speechSynthesis.getVoices();
  if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = () => {
      cachedVoice = pickEnglishVoice();
    };
  }
}