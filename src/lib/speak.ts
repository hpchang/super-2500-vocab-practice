/** Browser text-to-speech wrapper around window.speechSynthesis. */

import { getPrefs } from '@/prefs';

export function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.speechSynthesis.speak === 'function'
  );
}

/** Prefer a reliable English voice: local (built-in) en-US first, then
 *  local en-*, then any en-US, then any en-*. Some system novelty voices
 *  are registered but silent, so local built-ins are the safe default. */
function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const en = voices.filter((v) => v.lang.startsWith('en'));
  return (
    en.find((v) => v.localService && v.lang === 'en-US') ??
    en.find((v) => v.localService) ??
    en.find((v) => v.lang === 'en-US') ??
    en[0] ??
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
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9; // slightly slower for learners
  u.pitch = 1;
  if (!cachedVoice) cachedVoice = pickEnglishVoice();
  if (cachedVoice) u.voice = cachedVoice;

  // Watchdog: some registered voices are silent (no start event, no error).
  // If nothing started within 1.2s, retry once with the default voice.
  let started = false;
  let retried = false;
  const watchdog = setTimeout(() => {
    if (started || retried) return;
    retried = true;
    console.warn('[speak] no start event; retrying with default voice.', diagnoseSpeech());
    synth.cancel();
    const fallback = new SpeechSynthesisUtterance(text);
    fallback.lang = 'en-US';
    fallback.rate = 0.9;
    synth.speak(fallback);
  }, 1200);

  u.onstart = () => {
    started = true;
    clearTimeout(watchdog);
  };
  u.onerror = (e) => {
    clearTimeout(watchdog);
    console.warn('[speak] utterance error:', (e as SpeechSynthesisErrorEvent).error);
  };

  // Chrome drops utterances when cancel() and speak() run in the same tick,
  // and speech stuck in a paused state never plays without resume().
  // Cancel only when something is actually playing, then defer the new
  // utterance to the next tick (fixes 「有按鈕、沒聲音」).
  const guardedResume = () => {
    try {
      synth.resume?.();
    } catch {
      // resume() missing/throwing is harmless when nothing is paused.
    }
  };
  if (synth.speaking || synth.pending || synth.paused) {
    synth.cancel();
    guardedResume();
    setTimeout(() => synth.speak(u), 0);
  } else {
    guardedResume();
    synth.speak(u);
  }
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

/** Diagnostic: report why speech may be silent (console, dev only). */
export function diagnoseSpeech(): string {
  if (!isSpeechSupported()) return 'speechSynthesis unsupported';
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter((v) => v.lang.startsWith('en'));
  return [
    `voices=${voices.length}`,
    `enVoices=${en.length}`,
    `cachedVoice=${cachedVoice ? cachedVoice.name : 'none'}`,
    `speaking=${window.speechSynthesis.speaking}`,
    `pending=${window.speechSynthesis.pending}`,
    `paused=${window.speechSynthesis.paused}`,
  ].join(', ');
}