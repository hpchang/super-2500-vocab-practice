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

/** 將今天的 snapshot 封存為每日摘要（今日結束或計畫完成時呼叫）。 */
export function archiveToday(progress: ProgressData): void {
  if (!state?.today) return;
  const date = state.today.date;
  if (state.days.some((d) => d.date === date)) return;
  const tp = todayProgress(state.today, progress);
  const record: PlanDayRecord = {
    date,
    day: state.today.day,
    newCount: tp.newDone,
    reviewCount: tp.reviewDone,
    completed: tp.done,
  };
  state = { ...state, days: [...state.days, record] };
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
 *  完成後仍保留 corpus 供既有複習功能使用。 */
export function maybeCompletePlan(progress: ProgressData): void {
  if (!state) return;
  const st = planState({ plan: state, progress, now: Date.now() });
  if (!st.acquisitionComplete) return;
  archiveToday(progress);
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

export { PLAN_TOTAL_DAYS, PLAN_SCHEMA_VERSION, daysBetween, loadPlan };