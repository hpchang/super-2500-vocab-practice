import { useSyncExternalStore } from 'react';
import type { ProgressData, EntryProgress } from '@/types/index';
import {
  loadProgress,
  saveProgress,
  emptyProgress,
  getEntryProgress,
  setEntryProgress,
  clearProgress,
} from '@/lib/storage';

let state: ProgressData = loadProgress();
const listeners = new Set<() => void>();

function emit() {
  saveProgress(state);
  for (const l of listeners) l();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSnapshot(): ProgressData {
  return state;
}

export function useProgress(): ProgressData {
  return useSyncExternalStore(subscribe, getSnapshot, emptyProgress);
}

export function updateEntryProgress(
  entryId: string,
  fn: (prev: EntryProgress) => EntryProgress,
): void {
  const prev = getEntryProgress(state, entryId);
  const next = fn(prev);
  state = setEntryProgress(state, entryId, next);
  emit();
}

export function resetProgress(): void {
  state = clearProgress();
  for (const l of listeners) l();
}

export { getEntryProgress };