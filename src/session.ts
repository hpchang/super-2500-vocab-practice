import type { QuestionType } from '@/types/index';
import type { PlanSection } from '@/types/index';
import type { DifficultyMode } from '@/lib/questions';
import { appendHistory } from '@/lib/history';
import { recordPlanAnswer } from '@/studyPlanStore';

/** 跨 Unit 計畫 session 的 sentinel：一鍵複習把整區待做字（可跨 Unit）
 *  放進同一 session。與 plan.unit 同值即可通過 parser 的相等檢查。 */
export const MULTI_UNIT = 'multi';

const KEY = 'vocab-super2500-session';
const RESULT_KEY = 'vocab-super2500-lastresult';

/** 計畫情境：session 來自學習計畫的今日任務。可選——legacy session 不帶。 */
export interface PlanContext {
  planId: string;
  /** 排定日期（本地日曆日 'YYYY-MM-DD'）。 */
  date: string;
  section: PlanSection;
  /** 本組的 Unit（planContext.unit 需與 SessionConfig.unit 一致）。 */
  unit: string;
}

export interface SessionConfig {
  unit: string;
  entryIds: string[];
  type: QuestionType | 'mixed';
  batchSize: number;
  /** Cloze difficulty mode; only used when type is 'cloze'. */
  difficulty?: DifficultyMode;
  /** Which time this batch is being practiced (0-based). Varies the
   *  question order and mixed-type rotation between rounds of the same
   *  batch; absent (undefined) behaves like 0 — legacy sessions included. */
  round?: number;
  /** 計畫情境（可選）；checkpoint round-trip 保留，供 Practice/Results
   *  回寫 task 完成與「繼續今日下一組」。 */
  plan?: PlanContext;
}

export interface SessionResult {
  unit: string;
  type: QuestionType | 'mixed';
  /** Cloze difficulty mode, preserved so "下一批" keeps a fixed difficulty (P0-7). */
  difficulty?: DifficultyMode;
  /** 計畫情境，自 SessionConfig 保留。 */
  plan?: PlanContext;
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
const PLAN_SECTIONS = ['required-review', 'new', 'optional-strong'];

function isPlanSection(v: unknown): v is PlanSection {
  return typeof v === 'string' && (PLAN_SECTIONS as string[]).includes(v);
}

function parsePlanContext(v: unknown): PlanContext | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.planId !== 'string' || o.planId.length === 0) return null;
  if (typeof o.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return null;
  if (!isPlanSection(o.section)) return null;
  if (typeof o.unit !== 'string' || o.unit.length === 0) return null;
  return { planId: o.planId, date: o.date, section: o.section, unit: o.unit };
}

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
  if (o.round !== undefined) {
    // Round must be a non-negative integer; anything else is malformed
    // storage, not a legacy session.
    if (
      typeof o.round !== 'number' ||
      !Number.isInteger(o.round) ||
      o.round < 0
    ) {
      return null;
    }
    cfg.round = o.round;
  }
  // 計畫情境（可選）：未知或損壞的 plan context 讓 session 解析失敗，
  // 回退為無 session，而不是讓 Practice crash（P0-9 同一政策）。
  const plan = parsePlanContext(o.plan);
  if (plan === null) return null;
  if (plan) {
    // plan.unit 必須與 session.unit 一致，否則視為 malformed。
    if (plan.unit !== o.unit) return null;
    cfg.plan = plan;
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
  const plan = parsePlanContext(o.plan);
  if (plan === null) return null;
  if (plan) {
    if (plan.unit !== o.unit) return null;
    out.plan = plan;
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
    // 計畫 session 的每日統計（只算計畫任務）：以日期為鍵即時累加，
    // 供計畫成效的每日正確率與累計指標使用。無計畫時 store 內部 no-op。
    if (r.plan) {
      recordPlanAnswer(
        r.plan.date,
        r.results.length,
        r.results.filter((x) => x.correct).length,
        Date.now(),
      );
    }
  }
  return safeSetItem(RESULT_KEY, JSON.stringify(r));
}

export function loadResult(): SessionResult | null {
  const raw = safeGetItem(RESULT_KEY);
  if (!raw) return null;
  return parseSessionResult(raw);
}