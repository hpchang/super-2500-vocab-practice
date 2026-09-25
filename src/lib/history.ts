import type { QuestionType } from '@/types/index';

/**
 * Practice history (P2-3): one record per completed session, persisted to
 * localStorage and rendered as a trend on the Results screen. Separate key
 * from learning progress so 清除進度 semantics can be decided independently;
 * records are capped to keep storage bounded.
 */

const KEY = 'vocab-super2500-history';
export const HISTORY_SCHEMA = 1;
const SCHEMA = HISTORY_SCHEMA;
export const MAX_RECORDS = 200;

export interface HistoryRecord {
  schema: number;
  /** Epoch ms when the session completed. */
  at: number;
  unit: string;
  type: QuestionType | 'mixed';
  total: number;
  correct: number;
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

const QUESTION_TYPES = ['flashcard', 'en2zh', 'zh2en', 'cloze', 'spelling'];

function isQuestionType(v: unknown): v is QuestionType | 'mixed' {
  return v === 'mixed' || (typeof v === 'string' && QUESTION_TYPES.includes(v));
}

/** Shape check for one record — shared by loadHistory and the backup
 *  importer, which must drop malformed records rather than trust a file. */
export function isHistoryRecord(v: unknown): v is HistoryRecord {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o.schema === SCHEMA &&
    typeof o.at === 'number' &&
    Number.isFinite(o.at) &&
    typeof o.unit === 'string' &&
    isQuestionType(o.type) &&
    typeof o.total === 'number' &&
    typeof o.correct === 'number' &&
    o.total > 0 &&
    o.correct >= 0 &&
    o.correct <= o.total
  );
}

/** Runtime validation — malformed history must not crash the app (P0-9 policy). */
function parseHistory(raw: string): HistoryRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isHistoryRecord);
}

/**
 * Union two history lists, keyed by completion time (`at`), newest last.
 * Sessions are identified by their timestamp — the same session copied
 * between devices must count once, not twice.
 */
export function mergeHistoryRecords(
  local: HistoryRecord[],
  remote: HistoryRecord[],
): HistoryRecord[] {
  const byAt = new Map<number, HistoryRecord>();
  for (const r of local) byAt.set(r.at, r);
  for (const r of remote) byAt.set(r.at, r);
  return [...byAt.values()]
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_RECORDS);
}

/** Write a merged list back. Returns how many records were newly added
 *  relative to what was already stored. */
export function applyImportedHistory(records: HistoryRecord[]): number {
  const before = loadHistory();
  const beforeAts = new Set(before.map((r) => r.at));
  const merged = mergeHistoryRecords(before, records);
  safeSetItem(KEY, JSON.stringify(merged));
  return merged.filter((r) => !beforeAts.has(r.at)).length;
}

export function loadHistory(): HistoryRecord[] {
  if (typeof window === 'undefined') return [];
  const raw = safeGetItem(KEY);
  if (!raw) return [];
  return parseHistory(raw);
}

export function appendHistory(
  record: Omit<HistoryRecord, 'schema'>,
): HistoryRecord[] {
  const history = loadHistory();
  history.push({ ...record, schema: SCHEMA });
  // Newest last; cap length so storage stays bounded.
  const trimmed = history.slice(-MAX_RECORDS);
  safeSetItem(KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** How many sessions of this unit+type have completed (all history).
 *  Used as the "round" seed so repeating the same batch varies the
 *  question order/type rotation between rounds. */
export function countCompleted(
  unit: string,
  type: QuestionType | 'mixed',
): number {
  return loadHistory().filter((r) => r.unit === unit && r.type === type)
    .length;
}

/** Aggregate records over the trailing window (default 30 days). */
export function historyStats(
  records: HistoryRecord[],
  now: number,
  windowDays = 30,
): { sessions: number; total: number; correct: number; accuracy: number } {
  const since = now - windowDays * 24 * 60 * 60 * 1000;
  let total = 0;
  let correct = 0;
  let sessions = 0;
  for (const r of records) {
    if (r.at < since) continue;
    sessions++;
    total += r.total;
    correct += r.correct;
  }
  return {
    sessions,
    total,
    correct,
    accuracy: total === 0 ? 0 : correct / total,
  };
}

/**
 * Per-day accuracy series for the trailing window, oldest first. Days with
 * no sessions are skipped (callers render gaps as such).
 */
export function historyDailySeries(
  records: HistoryRecord[],
  now: number,
  windowDays = 14,
): { day: string; total: number; correct: number }[] {
  const out: { day: string; total: number; correct: number }[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const dayStart = new Date(now - i * 24 * 60 * 60 * 1000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = dayStart.getTime() + 24 * 60 * 60 * 1000;
    let total = 0;
    let correct = 0;
    for (const r of records) {
      if (r.at >= dayStart.getTime() && r.at < dayEnd) {
        total += r.total;
        correct += r.correct;
      }
    }
    out.push({
      day: `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
      total,
      correct,
    });
  }
  return out;
}