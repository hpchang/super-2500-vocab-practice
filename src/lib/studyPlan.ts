/**
 * 90 天學習計畫的純函式引擎。不碰 localStorage——持久化在
 * studyPlanStorage.ts，訂閱在 studyPlanStore.ts。
 *
 * 日期一律以本地日曆日（'YYYY-MM-DD'）運算，不以 24 小時毫秒差計算
 * plan day，避免跨月、跨年與 DST 偏移。
 */

import { getUnits } from '@/lib/data';
import type {
  EntryProgress,
  PlanCorpus,
  PlanDaySnapshot,
  PlanSectionGroup,
  ProgressData,
  StudyPlan,
} from '@/types/index';
import {
  PLAN_LOAD_WARN_THRESHOLD,
  PLAN_SCHEMA_VERSION,
  PLAN_STRONG_LIMIT,
  PLAN_TOTAL_DAYS,
} from '@/types/index';

/** 本地日曆日 'YYYY-MM-DD'（不以 UTC，避免時區偏移誤差）。 */
export function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' → Date（當地時間午夜）。 */
export function fromLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 兩個本地日曆日的差（a - b，單位天）。 */
export function daysBetween(a: string, b: string): number {
  const da = fromLocalDate(a);
  const db = fromLocalDate(b);
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

/** 本地日曆日 + n 天。 */
export function addDays(date: string, n: number): string {
  const d = fromLocalDate(date);
  d.setDate(d.getDate() + n);
  return toLocalDate(d);
}

/** 凍結 2,476 個 target entry：全書 Unit 順序、Unit 內既有順序。
 *  同字跨 Unit 仍視為不同 entry。 */
export function buildCorpus(): PlanCorpus {
  const entryIds: string[] = [];
  const unitTotals: Record<string, number> = {};
  for (const u of getUnits()) {
    unitTotals[u.unit] = u.entries.length;
    for (const e of u.entries) entryIds.push(e.entryId);
  }
  return { entryIds, unitTotals };
}

/** Corpus fingerprint——結構比對（不 hash），供 corpus 相容性檢查。 */
export function corpusFingerprint(c: PlanCorpus): string {
  return c.entryIds.join(',');
}

/** 建立計畫時已介紹（totalAnswered > 0）的 entry 基線。 */
export function countIntroduced(
  corpus: PlanCorpus,
  progress: ProgressData,
): number {
  return corpus.entryIds.filter(
    (id) => (progress.entries[id]?.totalAnswered ?? 0) > 0,
  ).length;
}

export interface CreatePlanInput {
  startDate: string;
  corpus: PlanCorpus;
  progress: ProgressData;
  now: number;
}

/** 建立一份新計畫。承接既有進度：已作答 entry 抵免首次學習，
 *  但保留原熟悉度、錯題與到期狀態（不修改原 progress）。 */
export function createPlan(input: CreatePlanInput): StudyPlan {
  const endDate = addDays(input.startDate, PLAN_TOTAL_DAYS - 1);
  const plan: StudyPlan = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    planId: `plan-${input.now.toString(36)}`,
    status: 'active',
    startDate: input.startDate,
    endDate,
    tzOffset: new Date(input.now).getTimezoneOffset(),
    corpus: input.corpus,
    baselineIntroduced: countIntroduced(input.corpus, input.progress),
    today: null,
    days: [],
  };
  return plan;
}

/** 剩餘未介紹的 entry（凍結順序）。 */
export function remainingNewIds(
  corpus: PlanCorpus,
  progress: ProgressData,
): string[] {
  return corpus.entryIds.filter(
    (id) => (progress.entries[id]?.totalAnswered ?? 0) === 0,
  );
}

/** 每日新字配額：ceil(尚未介紹數 / 含今天在內的剩餘天數)。 */
export function newQuota(
  remaining: number,
  daysLeft: number,
): number {
  return Math.ceil(remaining / Math.max(daysLeft, 1));
}

/** Unit 名排序鍵（數字序，非字典序）。 */
function unitNum(unit: string): number {
  return Number.parseInt(unit.replace(/^u/, ''), 10) || 0;
}

/** 把 entry list 依 Unit 分組（維持凍結順序）。 */
export function groupByUnit(
  entryIds: string[],
): PlanSectionGroup[] {
  const order: string[] = [];
  const byUnit = new Map<string, string[]>();
  for (const id of entryIds) {
    const unit = id.slice(0, id.indexOf(':')).replace(/^u/, '');
    if (!byUnit.has(unit)) {
      byUnit.set(unit, []);
      order.push(unit);
    }
    byUnit.get(unit)!.push(id);
  }
  // 同一 snapshot 內以 Unit 數字序呈現。
  return order
    .sort((a, b) => unitNum(a) - unitNum(b))
    .map((unit) => ({ unit, entryIds: byUnit.get(unit)! }));
}

/** 錯題 ∪ 今日結束前到期的 learning／review，去重後依錯題優先、逾期時間排序。 */
export function requiredReviewIds(
  corpus: PlanCorpus,
  progress: ProgressData,
  now: number,
): string[] {
  const wrong: string[] = [];
  const due: { id: string; at: number }[] = [];
  for (const id of corpus.entryIds) {
    const p = progress.entries[id];
    if (!p) continue;
    if (p.inWrongQueue) {
      wrong.push(id);
      continue;
    }
    // 到期的 learning／review 為必做；new 由新字配額處理、strong 為可選。
    if (
      (p.stage === 'learning' || p.stage === 'review') &&
      isDue(p, now)
    ) {
      due.push({ id, at: p.nextReviewAt ?? 0 });
    }
  }
  // 錯題在前；到期內依 nextReviewAt 較早者優先。
  due.sort((a, b) => a.at - b.at);
  const seen = new Set(wrong);
  const rest = due.map((d) => d.id).filter((id) => !seen.has(id));
  return [...wrong, ...rest];
}

function isDue(p: EntryProgress, now: number): boolean {
  if (p.nextReviewAt == null) return true;
  return p.nextReviewAt <= now;
}

/** 到期 strong，取最優先的前 limit 個（可選快複習）。 */
export function optionalStrongIds(
  corpus: PlanCorpus,
  progress: ProgressData,
  now: number,
  limit: number = PLAN_STRONG_LIMIT,
): string[] {
  const due: { id: string; at: number }[] = [];
  for (const id of corpus.entryIds) {
    const p = progress.entries[id];
    if (!p || p.stage !== 'strong') continue;
    if (isDue(p, now)) due.push({ id, at: p.nextReviewAt ?? 0 });
  }
  due.sort((a, b) => a.at - b.at);
  return due.slice(0, limit).map((d) => d.id);
}

/** 剩餘未介紹數（今日 snapshot 凍結前顯示用）。 */
export function remainingNewCount(
  corpus: PlanCorpus,
  progress: ProgressData,
): number {
  return remainingNewIds(corpus, progress).length;
}

export interface PlanStateInput {
  plan: StudyPlan;
  progress: ProgressData;
  now: number;
}

export interface PlanState {
  /** 今天對應的本地日曆日。 */
  today: string;
  /** 1-based 計畫第幾天；< 1＝尚未開始，> 90＝逾期。 */
  day: number;
  /** 超過第 90 天仍未完成。 */
  overdue: boolean;
  /** 剩餘未介紹 entry 數。 */
  remainingNew: number;
  /** 已介紹 entry 數（基線抵免＋計畫期間新學）。 */
  introduced: number;
  /** 全書首次學習是否完成。 */
  acquisitionComplete: boolean;
  /** 今日每日新字配額（凍結 snapshot 前的即時預估）。 */
  newQuota: number;
  /** 含今天在內的剩餘天數。 */
  daysLeft: number;
  /** 負荷警告：每日新字配額 > 40。 */
  loadWarning: boolean;
}

/** 推導計畫狀態（顯示用）。不建立或改變 snapshot。 */
export function planState(input: PlanStateInput): PlanState {
  const { plan, progress, now } = input;
  const todayStr = toLocalDate(new Date(now));
  const day = daysBetween(todayStr, plan.startDate) + 1;
  const overdue = day > PLAN_TOTAL_DAYS;
  const remaining = remainingNewIds(plan.corpus, progress).length;
  const introduced = countIntroduced(plan.corpus, progress);
  const daysLeft = Math.max(1, PLAN_TOTAL_DAYS - Math.max(day, 1) + 1);
  const quota = Math.ceil(remaining / daysLeft);
  return {
    today: todayStr,
    day,
    overdue,
    remainingNew: remaining,
    introduced,
    acquisitionComplete: remaining === 0,
    newQuota: quota,
    daysLeft,
    loadWarning: quota > PLAN_LOAD_WARN_THRESHOLD,
  };
}

/** 取得（或沿用）今天的 snapshot。今天的 snapshot 已存在就直接回傳；
 *  不存在時以現在的 progress 凍結一份。 */
export function todaySnapshot(
  plan: StudyPlan,
  progress: ProgressData,
  now: number,
): PlanDaySnapshot {
  const st = planState({ plan, progress, now });
  if (plan.today && plan.today.date === st.today) return plan.today;
  const day = Math.max(1, Math.min(st.day, PLAN_TOTAL_DAYS));
  return buildDaySnapshotFor(plan, progress, st.today, day, now);
}

/** 依 plan 的 corpus 凍結當日 snapshot。 */
function buildDaySnapshotFor(
  plan: StudyPlan,
  progress: ProgressData,
  today: string,
  day: number,
  now: number,
): PlanDaySnapshot {
  const remaining = remainingNewIds(plan.corpus, progress);
  const left = Math.max(1, PLAN_TOTAL_DAYS - day + 1);
  const quota = Math.ceil(remaining.length / left);
  const quotaIds = remaining.slice(0, quota);
  return {
    day,
    date: today,
    newEntries: groupByUnit(quotaIds),
    requiredReview: groupByUnit(requiredReviewIds(plan.corpus, progress, now)),
    optionalStrong: groupByUnit(optionalStrongIds(plan.corpus, progress, now)),
  };
}

export interface TodayProgress {
  /** snapshot 中必做複習 entry 總數。 */
  reviewTotal: number;
  reviewDone: number;
  newTotal: number;
  newDone: number;
  optionalTotal: number;
  optionalDone: number;
  /** 必做複習＋新字皆至少作答一次。 */
  done: boolean;
}

/** 當日 task entry 展開。 */
function flat(groups: PlanSectionGroup[]): string[] {
  return groups.flatMap((g) => g.entryIds);
}

/** 該 entry 是否在今天（snapshot.date 的本地日曆日）作答過。
 *  不用 totalAnswered > 0——必做複習的字昨天就已有作答紀錄，
 *  那會讓今日一開始就被算成完成。以 lastAnsweredAt 落在
 *  [本地日0點, 次日0點) 判定；實際日長（DST）由下一個日曆日推得。 */
export function answeredToday(
  entryId: string,
  date: string,
  progress: ProgressData,
): boolean {
  const at = progress.entries[entryId]?.lastAnsweredAt;
  if (at == null) return false;
  const start = fromLocalDate(date).getTime();
  const end = fromLocalDate(addDays(date, 1)).getTime();
  return at >= start && at < end;
}

/** 當日完成進度。snapshot 一旦凍結就是完成條件的依據——答錯仍算完成
 *  當次 task，今日完成條件不會變成 moving target。 */
export function todayProgress(
  snapshot: PlanDaySnapshot,
  progress: ProgressData,
): TodayProgress {
  const reviewIds = flat(snapshot.requiredReview);
  const newIds = flat(snapshot.newEntries);
  const optIds = flat(snapshot.optionalStrong);
  const answered = (id: string) => answeredToday(id, snapshot.date, progress);
  const reviewDone = reviewIds.filter(answered).length;
  const newDone = newIds.filter(answered).length;
  const optDone = optIds.filter(answered).length;
  return {
    reviewTotal: reviewIds.length,
    reviewDone,
    newTotal: newIds.length,
    newDone,
    optionalTotal: optIds.length,
    optionalDone: optDone,
    done: reviewDone === reviewIds.length && newDone === newIds.length,
  };
}

/** 計畫完成判定：所有 target entry 皆已介紹。 */
export function planComplete(
  plan: StudyPlan,
  progress: ProgressData,
): boolean {
  return remainingNewIds(plan.corpus, progress).length === 0;
}