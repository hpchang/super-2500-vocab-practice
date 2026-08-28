import type { QuestionType } from '@/types/index';
import type { DifficultyMode } from '@/lib/questions';
import { appendHistory } from '@/lib/history';

const KEY = 'vocab-super2500-session';
const RESULT_KEY = 'vocab-super2500-lastresult';

export interface SessionConfig {
  unit: string;
  entryIds: string[];
  type: QuestionType | 'mixed';
  batchSize: number;
  /** Cloze difficulty mode; only used when type is 'cloze'. */
  difficulty?: DifficultyMode;
}

export interface SessionResult {
  unit: string;
  type: QuestionType | 'mixed';
  /** Cloze difficulty mode, preserved so "下一批" keeps a fixed difficulty (P0-7). */
  difficulty?: DifficultyMode;
  results: { entryId: string; type: QuestionType; correct: boolean }[];
}

/** Storage can throw when blocked (privacy mode) or full (quota). */
function safeSetItem(key: string, value: string): boolean {
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeGetItem(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export { parseSessionConfig };

const QUESTION_TYPES = ['flashcard', 'en2zh', 'zh2en', 'cloze', 'spelling'];
const DIFFICULTY_MODES = ['adaptive', 'easy', 'medium', 'hard'];

function isQuestionType(v: unknown): v is QuestionType | 'mixed' {
  return v === 'mixed' || (typeof v === 'string' && QUESTION_TYPES.includes(v));
}

function isDifficultyMode(v: unknown): v is DifficultyMode {
  return typeof v === 'string' && DIFFICULTY_MODES.includes(v);
}

/**
 * Runtime schema validation — JSON.parse alone accepts any shape, and a
 * malformed session must not crash the practice screen (P0-9).
 */
function parseSessionConfig(raw: string): SessionConfig | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.unit !== 'string' || o.unit.length === 0) return null;
  if (!Array.isArray(o.entryIds) || !o.entryIds.every((id) => typeof id === 'string')) {
    return null;
  }
  if (!isQuestionType(o.type)) return null;
  if (typeof o.batchSize !== 'number' || !Number.isFinite(o.batchSize) || o.batchSize <= 0) {
    return null;
  }
  const cfg: SessionConfig = {
    unit: o.unit,
    entryIds: o.entryIds,
    type: o.type,
    batchSize: o.batchSize,
  };
  if (o.difficulty !== undefined) {
    if (!isDifficultyMode(o.difficulty)) return null;
    cfg.difficulty = o.difficulty;
  }
  return cfg;
}

function parseSessionResult(raw: string): SessionResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.unit !== 'string' || o.unit.length === 0) return null;
  if (!isQuestionType(o.type)) return null;
  if (!Array.isArray(o.results)) return null;
  const results: SessionResult['results'] = [];
  for (const r of o.results) {
    if (typeof r !== 'object' || r === null) return null;
    const rr = r as Record<string, unknown>;
    if (typeof rr.entryId !== 'string' || !isQuestionType(rr.type) || typeof rr.correct !== 'boolean') {
      return null;
    }
    results.push({
      entryId: rr.entryId,
      type: rr.type as QuestionType,
      correct: rr.correct,
    });
  }
  const out: SessionResult = { unit: o.unit, type: o.type, results };
  if (o.difficulty !== undefined) {
    if (!isDifficultyMode(o.difficulty)) return null;
    out.difficulty = o.difficulty;
  }
  return out;
}

export function saveSession(cfg: SessionConfig): boolean {
  return safeSetItem(KEY, JSON.stringify(cfg));
}

export function loadSession(): SessionConfig | null {
  const raw = safeGetItem(KEY);
  if (!raw) return null;
  return parseSessionConfig(raw);
}

export function saveResult(r: SessionResult): boolean {
  // History (P2-3): append the completed session so trends can be shown.
  // Done here (not in ResultsScreen) so a screen refresh never double-records.
  if (r.results.length > 0) {
    appendHistory({
      at: Date.now(),
      unit: r.unit,
      type: r.type,
      total: r.results.length,
      correct: r.results.filter((x) => x.correct).length,
    });
  }
  return safeSetItem(RESULT_KEY, JSON.stringify(r));
}

export function loadResult(): SessionResult | null {
  const raw = safeGetItem(RESULT_KEY);
  if (!raw) return null;
  return parseSessionResult(raw);
}