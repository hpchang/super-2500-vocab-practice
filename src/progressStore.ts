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

/**
 * Another tab may have written progress since our snapshot was taken.
 * Merge foreign updates into local state before persisting, keyed by
 * lastAnsweredAt, so concurrent tabs add to each other's work instead of
 * the last writer clobbering it (P1 review 2026-08-29).
 */
function mergeRemote(remote: ProgressData | null): ProgressData | null {
  if (!remote) return null;
  let merged = state;
  let changed = false;
  for (const [id, remoteEntry] of Object.entries(remote.entries)) {
    const local = state.entries[id];
    if (!local) {
      merged = setEntryProgress(merged, id, remoteEntry);
      changed = true;
      continue;
    }
    const localAt = local.lastAnsweredAt ?? 0;
    const remoteAt = remoteEntry.lastAnsweredAt ?? 0;
    if (remoteAt > localAt) {
      merged = setEntryProgress(merged, id, remoteEntry);
      changed = true;
    }
  }
  return changed ? merged : null;
}

function emit() {
  saveProgress(state);
  for (const l of listeners) l();
}

// Keep in sync across tabs: a storage event fires in every OTHER tab when
// one writes. Merge those writes into our snapshot so the next local save
// does not clobber them.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'vocab-super2500-progress' || e.storageArea == null) return;
    try {
      const remote = e.newValue ? (JSON.parse(e.newValue) as ProgressData) : null;
      const merged = mergeRemote(remote);
      if (merged) {
        state = merged;
        emit();
      }
    } catch {
      // Unparseable remote write — the validation in loadProgress path
      // will handle it on next load; nothing to do here.
    }
  });
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
  // Re-read storage before applying: the last local snapshot may predate a
  // concurrent tab's write (e.g. a tab open since before another synced) —
  // merging on every update bounds the stale-writer window to one answer.
  const remote = loadProgress();
  const merged = mergeRemote(remote);
  if (merged) state = merged;
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