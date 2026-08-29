import { useSyncExternalStore } from 'react';

/**
 * Home unit-group expand state: which of the 4 groups (Unit 1–8 / 9–16 /
 * 17–24 / 25–32) are open. Persisted in localStorage, separate from
 * learning progress so 清除進度 doesn't collapse the user's view.
 */

const KEY = 'vocab-super2500-groups';
const SCHEMA = 1;

export interface GroupPrefs {
  schema: number;
  /** Open group ids, e.g. ['1', '3'] for Unit 1–8 and 17–24. Default: none (all collapsed). */
  openGroups: string[];
}

const DEFAULT_GROUPS: GroupPrefs = {
  schema: SCHEMA,
  openGroups: [],
};

let state: GroupPrefs = load();
const listeners = new Set<() => void>();

function load(): GroupPrefs {
  if (typeof window === 'undefined') return DEFAULT_GROUPS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_GROUPS;
    const parsed = JSON.parse(raw) as Partial<GroupPrefs>;
    if (!Array.isArray(parsed.openGroups)) return DEFAULT_GROUPS;
    return {
      schema: SCHEMA,
      openGroups: parsed.openGroups.filter((g): g is string => typeof g === 'string'),
    };
  } catch {
    return DEFAULT_GROUPS;
  }
}

function persist(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked — collapse state stays in-memory for this page load.
  }
}

export function subscribeGroups(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getGroups(): GroupPrefs {
  return state;
}

export function useGroups(): GroupPrefs {
  return useSyncExternalStore(subscribeGroups, getGroups, getGroups);
}

export function toggleGroup(group: string): void {
  const open = state.openGroups.includes(group);
  state = {
    ...state,
    openGroups: open
      ? state.openGroups.filter((g) => g !== group)
      : [...state.openGroups, group],
  };
  persist();
  for (const l of listeners) l();
}