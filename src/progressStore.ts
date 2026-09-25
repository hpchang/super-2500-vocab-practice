import { useSyncExternalStore } from 'react';
import type { ProgressData, EntryProgress } from '@/types/index';
import {
  loadProgress,
  saveProgress,
  emptyProgress,
  getEntryProgress,
  setEntryProgress,
  clearProgress,
  mergeProgressData,
  isValidEntry,
  PROGRESS_STORAGE_KEY,
} from '@/lib/storage';
import { clearCheckpoint } from '@/lib/checkpoint';
import { deletePlan as deleteStudyPlan } from '@/studyPlanStore';

let state: ProgressData = loadProgress();
const listeners = new Set<() => void>();

/**
 * Another tab may have written progress since our snapshot was taken.
 * Merge foreign updates into local state before persisting, keyed by
 * lastAnsweredAt, so concurrent tabs add to each other's work instead of
 * the last writer clobbering it (P1 review 2026-08-29). The rule itself
 * lives in storage.ts so the backup importer shares it exactly.
 */
function mergeRemote(remote: ProgressData | null): ProgressData | null {
  return mergeProgressData(state, remote);
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
    if (e.key !== PROGRESS_STORAGE_KEY || e.storageArea == null) return;
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
  // 清除進度同步移除學習計畫——留下計畫會與已清除的 progress 不一致
  //（計畫的抵免基線、今日 snapshot 都以 progress 為依據）。
  deleteStudyPlan();
  for (const l of listeners) l();
}

/** Stats surfaced to the import UI: how many words were adopted from the
 *  file, and how many local words the file's copies superseded. */
export interface ImportMergeStats {
  added: number;
  updated: number;
}

/**
 * Merge a backup file's progress into the live store. Uses `mergeRemote`,
 * so this is additive by construction — an import can never delete a word
 * the student has already practised here (I-13).
 */
export function applyImportedProgress(
  remote: ProgressData | null,
): ImportMergeStats {
  const stats: ImportMergeStats = { added: 0, updated: 0 };
  if (!remote) return stats;
  for (const [id, remoteEntry] of Object.entries(remote.entries)) {
    if (!isValidEntry(remoteEntry)) continue;
    const localEntry = state.entries[id];
    if (!localEntry) stats.added += 1;
    else if ((remoteEntry.lastAnsweredAt ?? 0) > (localEntry.lastAnsweredAt ?? 0)) {
      stats.updated += 1;
    }
  }
  const merged = mergeRemote(remote);
  if (merged) {
    state = merged;
    emit();
  }
  // 匯入改變了底層狀態，本機的中途恢復點（checkpoint）已不對應，留著只會
  // 讓學生恢復到一份與現況不符的練習。比照 resetProgress 的級聯語意。
  clearCheckpoint();
  return stats;
}

export { getEntryProgress };