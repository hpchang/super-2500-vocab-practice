/** 引導式 90 天學習計畫的型別（第一版僅 localStorage，不跨裝置）。 */

/** 今日計畫的三個區塊。 */
export type PlanSection = 'required-review' | 'new' | 'optional-strong';

/** 計畫的生命週期狀態。 */
export type PlanStatus = 'active' | 'completed';

/** 凍結的母體 fingerprint——資料變更時用來偵測 corpus 不相容。 */
export interface PlanCorpus {
  /** 凍結的 entry 順序（全書 Unit 順序、Unit 內既有順序）。 */
  entryIds: string[];
  /** 每個 Unit 的 entry 數，用於快速驗證。 */
  unitTotals: Record<string, number>;
}

/** 單一 entry 在當日 snapshot 中的狀態。 */
export interface PlanTaskEntry {
  entryId: string;
  unit: string;
}

/** 一個 Unit 在當日 snapshot 中的分組。 */
export interface PlanSectionGroup {
  unit: string;
  entryIds: string[];
}

/** 今日任務 snapshot——一經凍結，當日內不因作答或重新 render 改變。 */
export interface PlanDaySnapshot {
  /** 這是計畫的第幾天（1-based）。 */
  day: number;
  /** 排定日期，本地日曆日 'YYYY-MM-DD'。 */
  date: string;
  /** 凍結當日的剩餘新字（含今天應配額）。 */
  newEntries: PlanSectionGroup[];
  /** 必做複習：錯題 ∪ 今日結束前到期的 learning／review。 */
  requiredReview: PlanSectionGroup[];
  /** 可選快複習：到期 strong，最多 20 字。 */
  optionalStrong: PlanSectionGroup[];
}

/** 每日完成摘要（封存用）。 */
export interface PlanDayRecord {
  date: string;
  day: number;
  newCount: number;
  reviewCount: number;
  /** 當日必做是否全部完成。 */
  completed: boolean;
}

/** 學習計畫本體（存於 localStorage）。 */
export interface StudyPlan {
  schemaVersion: number;
  /** 計畫唯一 id（建立時間 base36）。 */
  planId: string;
  status: PlanStatus;
  /** 開始日，本地日曆日 'YYYY-MM-DD'。 */
  startDate: string;
  /** 固定截止日＝開始日 + 89 天，本地日曆日。 */
  endDate: string;
  /** 時區偏移（分鐘，new Date().getTimezoneOffset()），偵測跨時區漂移用。 */
  tzOffset: number;
  corpus: PlanCorpus;
  /** 建立計畫時已介紹（totalAnswered > 0）的 entry 數。 */
  baselineIntroduced: number;
  /** 當日 task snapshot（凍結；null＝今天尚未開始）。 */
  today: PlanDaySnapshot | null;
  /** 封存的每日摘要。 */
  days: PlanDayRecord[];
}

/** 計畫頁顯示用的今日狀態（由引擎推導，不持久化）。 */
export interface PlanTodayView {
  day: number;
  /** 超過 90 天則為逾期。 */
  overdue: boolean;
  /** 今日（含）剩餘天數。 */
  daysLeft: number;
  snapshot: PlanDaySnapshot | null;
  /** 當日應配的新字量（用於建立 snapshot 前的預估顯示）。 */
  newQuota: number;
  /** 剩餘未介紹新字總數。 */
  remainingNew: number;
  /** 負荷警告：每日新字配額超過此值。 */
  loadWarning: boolean;
}

/** 每日新字負荷警告門檻。 */
export const PLAN_LOAD_WARN_THRESHOLD = 40;

/** 可選 strong 快複習每日上限。 */
export const PLAN_STRONG_LIMIT = 20;

/** 計畫天數（含首尾共 90 個日曆天）。 */
export const PLAN_TOTAL_DAYS = 90;

export const PLAN_SCHEMA_VERSION = 1;