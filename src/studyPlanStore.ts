/**
 * 學習計畫的訂閱層（useSyncExternalStore），沿用 progressStore.ts 慣例。
 * 所有寫入操作在此集中，確保 task completion 的 idempotency：
 * 同一 task 重複回寫、Results reload 或 checkpoint 恢復不得重複計數。
 */

import { useSyncExternalStore } from 'react';
import type {
  PlanDayRecord,
  PlanDaySnapshot,
  StudyPlan,
} from '@/types/index';
import {
  buildCorpus,
  createPlan,
  planState,
  todaySnapshot,
  todayProgress,
  toLocalDate,
  daysBetween,
  corpusFingerprint,
} from '@/lib/studyPlan';
import {
  loadPlan,
  savePlan,
  removePlan,
  corpusMatches,
} from '@/lib/studyPlanStorage';
import { PLAN_TOTAL_DAYS, PLAN_SCHEMA_VERSION } from '@/types/index';
import type { ProgressData } from '@/types/index';

let state: StudyPlan | null = loadPlan();
let corpusCache = buildCorpus();
const listeners = new Set<() => void>();

function emit() {
  if (state) savePlan(state);
  else removePlan();
  for (const l of listeners) l();
}

// 跨分頁同步：另一個分頁寫入計畫時，跟進最新值（借 loadPlan 驗證，
// 不直接採信 e.newValue）。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'vocab-super2500-study-plan') return;
    state = loadPlan();
    for (const l of listeners) l();
  });
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getPlanSnapshot(): StudyPlan | null {
  return state;
}

export function useStudyPlan(): StudyPlan | null {
  return useSyncExternalStore(subscribe, getPlanSnapshot, () => null);
}

export function getCorpus() {
  return corpusCache;
}

/** 資料表是否仍與計畫凍結的 corpus 相容。 */
export function isCorpusCompatible(): boolean {
  if (!state) return true;
  corpusCache = buildCorpus();
  return corpusMatches(state, corpusCache);
}

export interface CreatePlanOptions {
  startDate?: string;
  now?: number;
}

/** 建立計畫（若已有 active 計畫則不重複建立）。 */
export function startPlan(
  progress: ProgressData,
  opts: CreatePlanOptions = {},
): StudyPlan {
  const now = opts.now ?? Date.now();
  corpusCache = buildCorpus();
  const startDate = opts.startDate ?? toLocalDate(new Date(now));
  state = createPlan({
    startDate,
    corpus: corpusCache,
    progress,
    now,
  });
  emit();
  return state;
}

/** 凍結今日 snapshot（冪等：同日重複呼叫沿用既有 snapshot）。 */
export function freezeToday(progress: ProgressData, now: number): PlanDaySnapshot | null {
  if (!state) return null;
  // todaySnapshot 對「今天已有 snapshot」直接沿用既有凍結值——
  // 作答改變 progress 後再呼叫也不會重算，維持 snapshot 凍結語意。
  const snap = todaySnapshot(state, progress, now);
  if (state.today && state.today === snap) return snap;
  state = { ...state, today: snap };
  emit();
  return snap;
}

/** 計畫 session 作答統計：以日期為鍵即時累加（同日多次 session 累加，
 *  跨日各自成格）。封存（archivePlanDay）補的是 newCount/reviewCount/
 *  completed，不會蓋掉 answered/correct。無計畫時 no-op。
 *  （now 參數保留對稱介面，目前未用到。） */
export function recordPlanAnswer(
  date: string,
  answered: number,
  correct: number,
  _now: number,
): void {
  if (!state) return;
  const existing = state.days.find((d) => d.date === date);
  const day = existing?.day ?? dayOfDate(state, date);
  const record: PlanDayRecord = {
    date,
    day,
    newCount: existing?.newCount ?? 0,
    reviewCount: existing?.reviewCount ?? 0,
    completed: existing?.completed ?? false,
    answered: (existing?.answered ?? 0) + answered,
    correct: (existing?.correct ?? 0) + correct,
  };
  state = upsertDay(state, record);
  emit();
}

/** 計畫天數（1-based）＝該日與開始日的差 +1。 */
function dayOfDate(plan: StudyPlan, date: string): number {
  return daysBetween(date, plan.startDate) + 1;
}

/** plan.days 以日期為鍵 upsert（維持日期序，同日只保留一筆）。 */
function upsertDay(plan: StudyPlan, record: PlanDayRecord): StudyPlan {
  const days = plan.days.filter((d) => d.date !== record.date);
  days.push(record);
  days.sort((a, b) => daysBetween(a.date, b.date));
  return { ...plan, days };
}

/** 把已過去的當日 snapshot 封存成每日摘要。守衛：snapshot 日期 < 今天
 *  （同一天不封存；不能用 days.some(...) 當守衛——同一天首次呼叫就寫入
 *  了，那會永久擋住封存）。冪等：同一天重複呼叫不重複寫入。 */
export function archivePlanDay(progress: ProgressData, now: number): void {
  if (!state?.today) return;
  const todayStr = toLocalDate(new Date(now));
  if (daysBetween(todayStr, state.today.date) < 1) return;
  const snap = state.today;
  const tp = todayProgress(snap, progress);
  const existing = state.days.find((d) => d.date === snap.date);
  const record: PlanDayRecord = {
    date: snap.date,
    day: snap.day,
    newCount: tp.newDone,
    reviewCount: tp.reviewDone,
    completed: tp.done,
    // 已有的作答統計保留；完全沒有紀錄的日子（零任務或純一般練習）
    // 補一筆 0/0，讓日曆與 streak 連續。
    answered: existing?.answered ?? 0,
    correct: existing?.correct ?? 0,
  };
  state = upsertDay(state, record);
  emit();
}

/** 作答後回寫：該 entry 是否屬於今日 snapshot 的任務。回傳 task 所在
 *  section（不屬於今日任務則 null）。 */
export function todaySectionOf(
  entryId: string,
  plan: StudyPlan,
  today: string,
): 'required-review' | 'new' | 'optional-strong' | null {
  const snap = plan.today;
  if (!snap || snap.date !== today) return null;
  const inGroups = (groups: PlanDaySnapshot['newEntries']) =>
    groups.some((g) => g.entryIds.includes(entryId));
  if (inGroups(snap.requiredReview)) return 'required-review';
  if (inGroups(snap.newEntries)) return 'new';
  if (inGroups(snap.optionalStrong)) return 'optional-strong';
  return null;
}

/** 計畫完成（全書 2,476 字皆已介紹）時封存今日並標示 completed。
 *  完成後仍保留 corpus 供既有複習功能使用。
 *  註：maybeCompletePlan 目前全專案無呼叫點——已知的缺口，本次不接線。 */
export function maybeCompletePlan(progress: ProgressData): void {
  if (!state) return;
  const st = planState({ plan: state, progress, now: Date.now() });
  if (!st.acquisitionComplete) return;
  archivePlanDay(progress, Date.now());
  if (state.status !== 'completed') {
    state = { ...state, status: 'completed' };
    emit();
  }
}

/** 刪除計畫（二階段確認由 UI 負責）。 */
export function deletePlan(): void {
  state = null;
  emit();
}

/** 匯入結果：採用（adopted）／合併（merged）／身分不符保留本機（mismatch）／無檔可套（none）。 */
export type PlanImportOutcome = 'adopted' | 'merged' | 'mismatch' | 'none';

export interface PlanImportStats {
  outcome: PlanImportOutcome;
  /** 匯入檔中補進本機的每日紀錄數。 */
  daysAdded: number;
  /** 兩機同日皆有紀錄、合併過的日期數。 */
  daysMerged: number;
}

/**
 * 逐欄位合併同一天的兩筆紀錄。**只有 `answered`／`correct` 是累計值**，
 * 兩機同日各自練的是不同份工作，故相加；`newCount`／`reviewCount` 是
 * 「當日完成量」的絕對值，取大（單調、不會少算）；`completed` 取 or。
 * 相加絕對值會產生「完成量比當日任務還多」的不可能數字，故不採。
 * `day` 保留本機——身分 gate 已確保 `startDate` 相同，故兩者必然相等。
 */
function mergeDayRecord(
  local: PlanDayRecord,
  remote: PlanDayRecord,
): PlanDayRecord {
  return {
    ...local,
    answered: (local.answered ?? 0) + (remote.answered ?? 0),
    correct: (local.correct ?? 0) + (remote.correct ?? 0),
    newCount: Math.max(local.newCount ?? 0, remote.newCount ?? 0),
    reviewCount: Math.max(local.reviewCount ?? 0, remote.reviewCount ?? 0),
    completed: local.completed || remote.completed,
  };
}

/**
 * 匯入備份檔中的學習計畫。身分＝（corpus 指紋、`startDate`）——**不是
 * `planId`**，`planId` 以建立時間產生，是裝置在地身分，兩機必然不同。
 *
 * - 本機無計畫 → 採用匯入的整份。
 * - 身分相同 → 逐欄位合併 `days`，其餘（`planId`、`today`、`corpus`、
 *   `status`、`baselineIntroduced`、`tzOffset`）保留本機。`today` 是
 *   裝置在地的凍結快照，跨機合併無意義；任務本身由進度推導，本機重新
 *   凍結即得正確結果。
 * - 身分不同 → 保留本機並回報 `mismatch`，不猜測、不覆蓋。
 */
export function applyImportedPlan(remote: StudyPlan | null): PlanImportStats {
  if (!remote) {
    return { outcome: 'none', daysAdded: 0, daysMerged: 0 };
  }
  if (!state) {
    state = remote;
    emit();
    return { outcome: 'adopted', daysAdded: remote.days.length, daysMerged: 0 };
  }
  const sameCorpus =
    corpusFingerprint(state.corpus) === corpusFingerprint(remote.corpus);
  if (!sameCorpus || state.startDate !== remote.startDate) {
    return { outcome: 'mismatch', daysAdded: 0, daysMerged: 0 };
  }

  const byDate = new Map(state.days.map((d) => [d.date, d]));
  let daysAdded = 0;
  let daysMerged = 0;
  for (const remoteDay of remote.days) {
    const localDay = byDate.get(remoteDay.date);
    if (!localDay) {
      byDate.set(remoteDay.date, remoteDay);
      daysAdded += 1;
      continue;
    }
    byDate.set(remoteDay.date, mergeDayRecord(localDay, remoteDay));
    daysMerged += 1;
  }
  const days = [...byDate.values()].sort((a, b) =>
    daysBetween(a.date, b.date),
  );
  // `today` 刻意保留本機現值（見上方說明）。
  state = { ...state, days };
  emit();
  return { outcome: 'merged', daysAdded, daysMerged };
}

export { PLAN_TOTAL_DAYS, PLAN_SCHEMA_VERSION, daysBetween, toLocalDate, loadPlan };