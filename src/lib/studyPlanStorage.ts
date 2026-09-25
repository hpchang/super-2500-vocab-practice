/**
 * 學習計畫儲存層。沿用 storage.ts 慣例：獨立 localStorage key、
 * schema version、runtime shape validation、safe get/set、損壞資料 fallback。
 * 計畫欄位不塞進既有 ProgressData——兩份資料的生命週期不同
 * （清除進度會同步移除計畫，但重設計畫不動 progress）。
 */

import type { StudyPlan, PlanCorpus } from '@/types/index';
import { PLAN_SCHEMA_VERSION } from '@/types/index';
import { corpusFingerprint } from './studyPlan';

export const PLAN_STORAGE_KEY = 'vocab-super2500-study-plan';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeSetItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Storage full or blocked — ignore so the app keeps working.
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

/** 欄位值必須是 'YYYY-MM-DD'。 */
function isLocalDate(v: unknown): v is string {
  return (
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  );
}

function isValidCorpus(v: unknown): v is PlanCorpus {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    Array.isArray(c.entryIds) &&
    c.entryIds.every((id) => typeof id === 'string') &&
    typeof c.unitTotals === 'object' &&
    c.unitTotals !== null
  );
}

/** Exported for the backup importer — an imported plan gets the same
 *  validation as one restored from storage. */
export function isValidPlan(v: unknown): v is StudyPlan {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  if (p.schemaVersion !== PLAN_SCHEMA_VERSION) return false;
  if (typeof p.planId !== 'string' || p.planId.length === 0) return false;
  if (p.status !== 'active' && p.status !== 'completed') return false;
  if (!isLocalDate(p.startDate) || !isLocalDate(p.endDate)) return false;
  if (typeof p.tzOffset !== 'number' || !Number.isFinite(p.tzOffset)) return false;
  if (!isValidCorpus(p.corpus)) return false;
  if (typeof p.baselineIntroduced !== 'number' || !Number.isFinite(p.baselineIntroduced)) {
    return false;
  }
  // today：null 或完整 snapshot。逐欄驗證太冗長——形狀檢查關鍵欄，
  // 內容欄位損壞由 snapshot 使用處的防禦（空陣列 fallback）兜底。
  if (p.today !== null && typeof p.today !== 'object') return false;
  if (p.today !== null) {
    const t = p.today as Record<string, unknown>;
    if (!isLocalDate(t.date)) return false;
    if (typeof t.day !== 'number' || !Number.isInteger(t.day) || t.day < 1) {
      return false;
    }
    for (const key of ['newEntries', 'requiredReview', 'optionalStrong']) {
      const groups = t[key];
      if (!Array.isArray(groups)) return false;
      for (const g of groups) {
        if (typeof g !== 'object' || g === null) return false;
        const gg = g as Record<string, unknown>;
        if (typeof gg.unit !== 'string' || !Array.isArray(gg.entryIds)) {
          return false;
        }
        if (!gg.entryIds.every((id) => typeof id === 'string')) return false;
      }
    }
  }
  if (!Array.isArray(p.days)) return false;
  return true;
}

/** 讀取計畫。損壞或不相容時回 null（不靜默改寫進行中的日程）。 */
export function loadPlan(): StudyPlan | null {
  if (!isBrowser()) return null;
  try {
    const raw = safeGetItem(PLAN_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidPlan(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 寫入計畫。回傳是否成功（blocked storage 時呼叫方須提示）。 */
export function savePlan(plan: StudyPlan): boolean {
  if (!isBrowser()) return false;
  return safeSetItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
}

export function removePlan(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(PLAN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** 全書 2,476 字表是否與計畫凍結的 corpus 一致。
 *  不相容時管理頁顯示提示，不靜默改寫進行中的日程。 */
export function corpusMatches(plan: StudyPlan, current: PlanCorpus): boolean {
  return corpusFingerprint(plan.corpus) === corpusFingerprint(current);
}