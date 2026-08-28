import type { QuestionType } from '@/types/index';
import type { Question } from '@/lib/questions';
import type { SessionConfig } from '@/session';
import {
  loadSession,
  parseSessionConfig,
} from '@/session';

const KEY = 'vocab-super2500-checkpoint';

/**
 * Practice session resume checkpoint (P2-1). A snapshot of an in-flight
 * session, persisted to localStorage so a student who closes the tab (or
 * refreshes) can pick up exactly where they left off — same questions,
 * same position, same partial results.
 *
 * sessionStorage (used by `session.ts`) survives refresh but NOT tab close;
 * the checkpoint goes to localStorage precisely for the tab-close case.
 */

export interface Checkpoint {
  /** The session this checkpoint belongs to. */
  session: SessionConfig;
  /** The locked question list, as presented. */
  questions: Question[];
  /** Index of the question being answered (0-based). */
  index: number;
  /** Results for questions already answered. */
  results: { entryId: string; type: QuestionType; correct: boolean }[];
  /** Saved at, so stale checkpoints (weeks old) can be skipped. */
  savedAt: number;
}

/** Storage can throw when blocked (privacy mode) or full (quota). */
function safeSetItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveCheckpoint(cp: Checkpoint): boolean {
  return safeSetItem(KEY, JSON.stringify(cp));
}

export function loadCheckpoint(): Checkpoint | null {
  const raw = safeGetItem(KEY);
  if (!raw) return null;
  return parseCheckpoint(raw);
}

export function clearCheckpoint(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore — nothing to recover
  }
}

const QUESTION_TYPES = ['flashcard', 'en2zh', 'zh2en', 'cloze', 'spelling'];
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // a week-old resume offer is stale

function isQuestionType(v: unknown): v is QuestionType | 'mixed' {
  return v === 'mixed' || (typeof v === 'string' && QUESTION_TYPES.includes(v));
}

/**
 * Runtime validation — a corrupted checkpoint must fall back to a fresh
 * session, never crash the practice screen (same policy as P0-9).
 */
export function parseCheckpoint(raw: string): Checkpoint | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;

  // Session shape is validated by the same parser used for live sessions.
  const session = parseSessionConfig(JSON.stringify(o.session ?? {}));
  if (!session) return null;

  if (
    typeof o.index !== 'number' ||
    !Number.isInteger(o.index) ||
    o.index < 0
  ) {
    return null;
  }
  if (!Array.isArray(o.questions)) return null;
  for (const q of o.questions) {
    if (typeof q !== 'object' || q === null) return null;
    const qq = q as Record<string, unknown>;
    if (typeof qq.entryId !== 'string') return null;
    if (
      typeof qq.type !== 'string' ||
      !QUESTION_TYPES.includes(qq.type)
    ) {
      return null;
    }
    if (typeof qq.prompt !== 'string' || typeof qq.answer !== 'string') {
      return null;
    }
    if (qq.options !== undefined) {
      if (!Array.isArray(qq.options)) return null;
      for (const opt of qq.options) {
        if (
          typeof opt !== 'object' ||
          opt === null ||
          typeof (opt as Record<string, unknown>).entryId !== 'string' ||
          typeof (opt as Record<string, unknown>).label !== 'string'
        ) {
          return null;
        }
      }
    }
  }
  if (!Array.isArray(o.results)) return null;
  for (const r of o.results) {
    if (typeof r !== 'object' || r === null) return null;
    const rr = r as Record<string, unknown>;
    if (
      typeof rr.entryId !== 'string' ||
      !isQuestionType(rr.type) ||
      typeof rr.correct !== 'boolean'
    ) {
      return null;
    }
  }
  if (typeof o.savedAt !== 'number' || !Number.isFinite(o.savedAt)) {
    return null;
  }

  const checkpoint: Checkpoint = {
    session,
    questions: o.questions as Question[],
    index: o.index,
    results: o.results as Checkpoint['results'],
    savedAt: o.savedAt,
  };

  // Consistency: index must point inside the question list.
  if (checkpoint.index >= checkpoint.questions.length) return null;
  // Consistency: results cover the answered questions — either those
  // before the current one (saved during "next") or including the current
  // one (saved right after answering, while feedback is still showing).
  if (
    checkpoint.results.length !== checkpoint.index &&
    checkpoint.results.length !== checkpoint.index + 1
  ) {
    return null;
  }
  // Freshness: skip week-old leftovers.
  if (Date.now() - checkpoint.savedAt > MAX_AGE_MS) return null;

  return checkpoint;
}

/** True when a checkpoint exists and matches the live session config. */
export function hasResumableCheckpoint(): boolean {
  const cp = loadCheckpoint();
  if (!cp) return false;
  // The stored session config must still resolve the same batch — if the
  // student already started a DIFFERENT session this tab, don't offer stale
  // questions. (loadSession() returns null when sessionStorage is empty, so
  // a closed-tab return still resumes.)
  const live = loadSession();
  if (live && JSON.stringify(live) !== JSON.stringify(cp.session)) {
    return false;
  }
  // Questions reference entryIds; if the batch no longer matches what the
  // stored questions were built from, the checkpoint is stale.
  return true;
}