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
import { clearCheckpoint } from '@/lib/checkpoint';

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
  // 清除進度 also drops any in-flight resume checkpoint (P2-1) — with all
  // records gone there is no session worth resuming.
  clearCheckpoint();
  for (const l of listeners) l();
}

export { getEntryProgress };