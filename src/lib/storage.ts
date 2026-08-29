import type { ProgressData, EntryProgress } from '@/types/index';
import { makeInitialProgress } from './scheduler';

const STORAGE_KEY = 'vocab-super2500-progress';
export const CURRENT_SCHEMA = 1;

export function emptyProgress(): ProgressData {
  return { schemaVersion: CURRENT_SCHEMA, entries: {} };
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

const STAGES = ['new', 'learning', 'review', 'strong'];

/**
 * Structural check for a restored EntryProgress. Home dereferences fields
 * (inWrongQueue, nextReviewAt) directly, so a malformed entry saved by an
 * older version or corrupt update must be dropped, never propagated.
 */
function isValidEntry(v: unknown): v is EntryProgress {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.entryId === 'string' &&
    typeof e.stage === 'string' &&
    STAGES.includes(e.stage) &&
    typeof e.totalAnswered === 'number' &&
    typeof e.totalCorrect === 'number' &&
    typeof e.totalWrong === 'number' &&
    typeof e.streak === 'number' &&
    typeof e.inWrongQueue === 'boolean' &&
    typeof e.wrongCount === 'number' &&
    (e.lastAnsweredAt === null || typeof e.lastAnsweredAt === 'number') &&
    (e.nextReviewAt === null || typeof e.nextReviewAt === 'number') &&
    (e.lastWrongType === null || typeof e.lastWrongType === 'string')
  );
}

/** Load progress, safely recovering from corruption or old schema. */
export function loadProgress(): ProgressData {
  if (!isBrowser()) return emptyProgress();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress();
    let parsed = JSON.parse(raw) as ProgressData;
    if (!parsed || typeof parsed !== 'object' || !parsed.entries) {
      return emptyProgress();
    }
    if (parsed.schemaVersion !== CURRENT_SCHEMA) {
      parsed = migrate(parsed);
    }
    // Drop malformed entries instead of crash later during render.
    const entries: ProgressData['entries'] = {};
    for (const [id, v] of Object.entries(parsed.entries)) {
      if (isValidEntry(v)) entries[id] = v;
    }
    return { schemaVersion: CURRENT_SCHEMA, entries };
  } catch {
    // Corrupted data — start fresh rather than crashing.
    return emptyProgress();
  }
}

export function saveProgress(data: ProgressData): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked — silently ignore so the app keeps working.
  }
}

/** Migration hook. v1 is current; future versions migrate here. */
function migrate(prev: ProgressData): ProgressData {
  if (prev.schemaVersion === CURRENT_SCHEMA) return prev;
  // Forward-compatible: if schema is newer than supported, keep entries as-is
  // but flag our version. If older, we'd transform here. For now v1 is baseline.
  return { schemaVersion: CURRENT_SCHEMA, entries: prev.entries ?? {} };
}

export function getEntryProgress(
  data: ProgressData,
  entryId: string,
): EntryProgress {
  return data.entries[entryId] ?? makeInitialProgress(entryId);
}

export function setEntryProgress(
  data: ProgressData,
  entryId: string,
  entry: EntryProgress,
): ProgressData {
  return {
    ...data,
    entries: { ...data.entries, [entryId]: entry },
  };
}

export function clearProgress(): ProgressData {
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return emptyProgress();
}