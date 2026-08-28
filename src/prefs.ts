import { useSyncExternalStore } from 'react';

/**
 * App preferences (P1-6 / P2-3 / P2-4): speech autoplay, reduced motion,
 * theme. Persisted in localStorage, separate from learning progress so
 * 清除進度 doesn't reset the user's UI settings.
 */

const KEY = 'vocab-super2500-prefs';
const SCHEMA = 1;

export interface Prefs {
  schema: number;
  /** Auto-pronounce words on question load / after answering. */
  speechAutoplay: boolean;
  /** Speech rate for pronunciation (0.5 slow — 1.4 fast; default 0.9). */
  speechRate: number;
  /** Respect prefers-reduced-motion (default) or force animations on. */
  reducedMotion: boolean;
  /** 'system' follows the OS; 'light' / 'dark' force a theme. */
  theme: 'system' | 'light' | 'dark';
  /** Advance to the next question automatically after a correct answer. */
  autoAdvance: boolean;
}

export const SPEECH_RATE_STEPS = [0.6, 0.75, 0.9, 1.1, 1.3] as const;

const DEFAULT_PREFS: Prefs = {
  schema: SCHEMA,
  speechAutoplay: true,
  speechRate: 0.9,
  reducedMotion: true,
  theme: 'system',
  autoAdvance: false,
};

let state: Prefs = load();
const listeners = new Set<() => void>();

function load(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      schema: SCHEMA,
      // Only accept known values.
      theme: ['system', 'light', 'dark'].includes(parsed.theme ?? '')
        ? (parsed.theme as Prefs['theme'])
        : 'system',
      autoAdvance:
        typeof parsed.autoAdvance === 'boolean' ? parsed.autoAdvance : false,
      speechRate:
        typeof parsed.speechRate === 'number' &&
        SPEECH_RATE_STEPS.includes(parsed.speechRate as any)
          ? parsed.speechRate
          : DEFAULT_PREFS.speechRate,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function persist(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked — settings stay in-memory for this page load.
  }
}

function emit(): void {
  persist();
  applySideEffects(state);
  for (const l of listeners) l();
}

/** Reflect prefs onto the document (data-theme / reduced-motion class). */
function applySideEffects(p: Prefs): void {
  if (typeof document === 'undefined') return;
  if (p.theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', p.theme);
  }
  document.documentElement.classList.toggle('force-motion', !p.reducedMotion);
}

export function subscribePrefs(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getPrefs(): Prefs {
  return state;
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribePrefs, getPrefs, getPrefs);
}

export function updatePrefs(patch: Partial<Prefs>): void {
  state = { ...state, ...patch };
  emit();
}

// Apply persisted prefs on module load so a page refresh keeps the theme.
applySideEffects(state);