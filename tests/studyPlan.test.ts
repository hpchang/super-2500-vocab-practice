import { describe, it, expect } from 'vitest';
import {
  toLocalDate,
  fromLocalDate,
  daysBetween,
  addDays,
  buildCorpus,
  countIntroduced,
  createPlan,
  remainingNewIds,
  newQuota,
  requiredReviewIds,
  optionalStrongIds,
  groupByUnit,
  pendingSectionIds,
  planState,
  todayProgress,
  answeredToday,
  planComplete,
} from '../src/lib/studyPlan.js';
// —— 測試檔尾 helper 使用的 re-export 已移除，直接用上面的 import ——
import { emptyProgress, setEntryProgress } from '../src/lib/storage.js';
import { makeInitialProgress, recordAnswer } from '../src/lib/scheduler.js';
import { getUnits } from '../src/lib/data.js';
import type { ProgressData } from '../src/types/index.js';
import { PLAN_TOTAL_DAYS, PLAN_STRONG_LIMIT } from '../src/types/index.js';

// —— 日期工具 ——

describe('studyPlan date utils', () => {
  it('toLocalDate formats as YYYY-MM-DD in local time', () => {
    expect(toLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toLocalDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('daysBetween works across month and year boundaries', () => {
    expect(daysBetween('2026-03-01', '2026-02-27')).toBe(2);
    expect(daysBetween('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('addDays crosses month/year correctly', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('fromLocalDate round-trips through toLocalDate', () => {
    const d = fromLocalDate('2026-07-15');
    expect(toLocalDate(d)).toBe('2026-07-15');
  });
});

// —— 母體與建立 ——

describe('studyPlan corpus', () => {
  it('covers all units with no missing or duplicate entries', () => {
    const corpus = buildCorpus();
    const units = getUnits();
    const expected = units.flatMap((u) => u.entries.map((e) => e.entryId));
    expect(corpus.entryIds).toEqual(expected);
    expect(new Set(corpus.entryIds).size).toBe(corpus.entryIds.length);
    expect(corpus.entryIds.length).toBeGreaterThan(2400);
    for (const u of units) {
      expect(corpus.unitTotals[u.unit]).toBe(u.entries.length);
    }
  });
});

describe('createPlan', () => {
  const now = new Date(2026, 8, 10, 10, 0).getTime(); // 2026-09-10 10:00

  it('sets fixed end date to start + 89 days (90 calendar days inclusive)', () => {
    const plan = createPlan({
      startDate: '2026-09-10',
      corpus: buildCorpus(),
      progress: emptyProgress(),
      now,
    });
    expect(plan.endDate).toBe('2026-12-08');
    expect(daysBetween(plan.endDate, plan.startDate)).toBe(89);
    expect(plan.schemaVersion).toBe(1);
    expect(plan.status).toBe('active');
    expect(plan.today).toBeNull();
  });

  it('credits existing progress as baseline without touching it', () => {
    let progress = emptyProgress();
    progress = setEntryProgress(
      progress,
      getUnits()[0].entries[0].entryId,
      recordAnswer(makeInitialProgress(getUnits()[0].entries[0].entryId), true, 'en2zh', now),
    );
    const corpus = buildCorpus();
    const plan = createPlan({
      startDate: '2026-09-10',
      corpus,
      progress,
      now,
    });
    expect(plan.baselineIntroduced).toBe(1);
    expect(countIntroduced(corpus, progress)).toBe(1);
    // 原 progress 未被修改（createPlan 是純函式）。
    expect(progress.entries[getUnits()[0].entries[0].entryId].totalAnswered).toBe(1);
  });
});

// —— 配額與平滑重排 ——

describe('daily quota', () => {
  it('empty progress distributes ~27/28 words across 90 days', () => {
    const corpus = buildCorpus();
    const total = corpus.entryIds.length;
    const quota = newQuota(total, PLAN_TOTAL_DAYS);
    expect(quota).toBeGreaterThanOrEqual(27);
    expect(quota).toBeLessThanOrEqual(28);
    // 90 天內可完整分配
    expect(quota * PLAN_TOTAL_DAYS).toBeGreaterThanOrEqual(total);
  });

  it('quota grows smoothly after missed days', () => {
    // 2,476 字、前 10 天沒做：剩 90 天時配額約 28，剩 80 天時約 31。
    const q90 = newQuota(2476, 90);
    const q80 = newQuota(2476, 80);
    expect(q90).toBe(28);
    expect(q80).toBe(31);
  });
});

// —— 必做複習 ——

describe('required review selection', () => {
  const now = new Date(2026, 8, 10, 10, 0).getTime();
  const corpus = buildCorpus();
  const ids = corpus.entryIds;

  it('unions wrong queue and due learning/review, dedup, wrong first', () => {
    let progress = emptyProgress();
    const wrongId = ids[0];
    const dueLearning = ids[1];
    const dueReview = ids[2];
    const futureLearning = ids[3];
    // 錯題
    progress = setEntryProgress(
      progress,
      wrongId,
      recordAnswer(makeInitialProgress(wrongId), false, 'en2zh', now - 2 * 86400000),
    );
    // 到期 learning（昨天到期）
    progress = setEntryProgress(
      progress,
      dueLearning,
      recordAnswer(makeInitialProgress(dueLearning), true, 'en2zh', now - 2 * 86400000),
    );
    // 到期 review（昨天到期）
    let rp = makeInitialProgress(dueReview);
    rp = recordAnswer(rp, true, 'en2zh', now - 5 * 86400000);
    rp = recordAnswer(rp, true, 'en2zh', now - 4 * 86400000);
    progress = setEntryProgress(progress, dueReview, rp);
    // 未到期 learning（明天到期）
    const fp = recordAnswer(makeInitialProgress(futureLearning), true, 'en2zh', now);
    progress = setEntryProgress(progress, futureLearning, fp);

    const result = requiredReviewIds(corpus, progress, now);
    expect(result).toContain(wrongId);
    expect(result).toContain(dueLearning);
    expect(result).toContain(dueReview);
    expect(result).not.toContain(futureLearning);
    // 錯題在最前
    expect(result.indexOf(wrongId)).toBeLessThan(result.indexOf(dueLearning));
    // 去重：不出現兩次
    expect(new Set(result).size).toBe(result.length);
  });

  it('excludes new and strong stages from required review', () => {
    let progress = emptyProgress();
    const newId = ids[0];
    progress = setEntryProgress(progress, newId, makeInitialProgress(newId));
    const result = requiredReviewIds(corpus, progress, now);
    expect(result).not.toContain(newId);
  });
});

describe('optional strong review', () => {
  const now = new Date(2026, 8, 10, 10, 0).getTime();
  const corpus = buildCorpus();
  const day = 86400000; // 保留：strong 測試用毫秒日差造到期時間

  it('caps due strong entries at the limit', () => {
    let progress = emptyProgress();
    const ids = corpus.entryIds.slice(0, PLAN_STRONG_LIMIT + 5);
    for (let i = 0; i < ids.length; i++) {
      // 過期 strong：nextReviewAt 在過去
      const p = {
        ...makeInitialProgress(ids[i]),
        stage: 'strong' as const,
        totalAnswered: 5,
        lastAnsweredAt: now - 10 * day,
        nextReviewAt: now - (i + 1) * day, // 越早到期越優先
      };
      progress = setEntryProgress(progress, ids[i], p);
    }
    const result = optionalStrongIds(corpus, progress, now);
    expect(result).toHaveLength(PLAN_STRONG_LIMIT);
    // 最優先（最早到期）的在前
    expect(result[0]).toBe(ids[PLAN_STRONG_LIMIT + 4]);
  });

  it('excludes not-yet-due strong entries', () => {
    let progress = emptyProgress();
    const id = corpus.entryIds[0];
    progress = setEntryProgress(progress, id, {
      ...makeInitialProgress(id),
      stage: 'strong',
      totalAnswered: 5,
      lastAnsweredAt: now,
      nextReviewAt: now + 3 * day,
    });
    expect(optionalStrongIds(corpus, progress, now)).toHaveLength(0);
  });
});

// —— Unit 分組 ——

describe('groupByUnit', () => {
  it('groups by unit in numeric order, preserving entry order', () => {
    const groups = groupByUnit(['u2:apple', 'u11:bed', 'u2:cat', 'u1:dog']);
    expect(groups.map((g) => g.unit)).toEqual(['1', '2', '11']);
    expect(groups[0].entryIds).toEqual(['u1:dog']);
    expect(groups[1].entryIds).toEqual(['u2:apple', 'u2:cat']);
    expect(groups[2].entryIds).toEqual(['u11:bed']);
  });
});

// —— 一鍵複習：壓平待做字 ——

describe('pendingSectionIds', () => {
  const date = '2026-09-10';
  const dayStart = fromLocalDate(date).getTime();
  const day = 86400000;

  it('flattens groups, drops entries answered today', () => {
    let progress = emptyProgress();
    // ids[0] 今天答過、ids[1] 昨天答過（仍是待做）、ids[2] 沒答過。
    for (const [i, at] of [dayStart + 1000, dayStart - day, null].entries()) {
      const id = `u11:w${i}`;
      progress = setEntryProgress(progress, id, {
        ...makeInitialProgress(id),
        totalAnswered: at == null ? 0 : 1,
        lastAnsweredAt: at ?? null,
      });
    }
    const groups = groupByUnit(['u11:w0', 'u11:w1', 'u11:w2']);
    const pending = pendingSectionIds(groups, date, progress);
    expect(pending).toEqual(['u11:w1', 'u11:w2']);
  });

  it('sorts wrong-queue entries first, then by nextReviewAt ascending', () => {
    let progress = emptyProgress();
    // 三個到期字：b 最早到期、a 較晚、c 在錯題佇列。
    const mk = (id: string, opts: { at: number; wrong?: boolean }) => {
      progress = setEntryProgress(progress, id, {
        ...makeInitialProgress(id),
        stage: 'review',
        totalAnswered: 3,
        inWrongQueue: opts.wrong ?? false,
        nextReviewAt: opts.at,
        lastAnsweredAt: dayStart - day,
      });
    };
    mk('u11:a', { at: dayStart - day + 2000 });
    mk('u11:b', { at: dayStart - day + 1000 });
    mk('u11:c', { at: dayStart - day + 3000, wrong: true });
    const groups = groupByUnit(['u11:a', 'u11:b', 'u11:c']);
    expect(pendingSectionIds(groups, date, progress)).toEqual([
      'u11:c',
      'u11:b',
      'u11:a',
    ]);
  });

  it('treats missing nextReviewAt as 0 (most overdue first)', () => {
    let progress = emptyProgress();
    for (const id of ['u11:a', 'u11:b']) {
      progress = setEntryProgress(progress, id, {
        ...makeInitialProgress(id),
        stage: 'review',
        totalAnswered: 1,
        lastAnsweredAt: dayStart - day,
      });
    }
    // u11:b 的 nextReviewAt 明確在過去；u11:a 缺（?? 0 → 視為最早）。
    progress = setEntryProgress(progress, 'u11:b', {
      ...progress.entries['u11:b'],
      nextReviewAt: dayStart - day + 500,
    });
    const groups = groupByUnit(['u11:a', 'u11:b']);
    expect(pendingSectionIds(groups, date, progress)).toEqual(['u11:a', 'u11:b']);
  });
});

// —— 計畫狀態 ——

describe('planState', () => {
  const corpus = buildCorpus();

  it('day 1 on start date; daysLeft 90', () => {
    const plan = createPlan({
      startDate: '2026-09-10',
      corpus,
      progress: emptyProgress(),
      now: fromLocalDate('2026-09-10').getTime(),
    });
    const st = planState({
      plan,
      progress: emptyProgress(),
      now: fromLocalDate('2026-09-10').getTime(),
    });
    expect(st.day).toBe(1);
    expect(st.daysLeft).toBe(90);
    expect(st.overdue).toBe(false);
  });

  it('day 90 is not overdue; day 91 is', () => {
    const plan = createPlan({
      startDate: '2026-01-01',
      corpus,
      progress: emptyProgress(),
      now: fromLocalDate('2026-01-01').getTime(),
    });
    const d90 = planState({
      plan,
      progress: emptyProgress(),
      now: fromLocalDate(addDays('2026-01-01', 89)).getTime(),
    });
    expect(d90.day).toBe(90);
    expect(d90.overdue).toBe(false);
    const d91 = planState({
      plan,
      progress: emptyProgress(),
      now: fromLocalDate(addDays('2026-01-01', 90)).getTime(),
    });
    expect(d91.day).toBe(91);
    expect(d91.overdue).toBe(true);
  });

  it('acquisitionComplete when all entries introduced', () => {
    const plan = createPlan({
      startDate: '2026-09-10',
      corpus,
      progress: emptyProgress(),
      now: fromLocalDate('2026-09-10').getTime(),
    });
    // 全部標成已作答
    let progress = emptyProgress();
    for (const id of corpus.entryIds) {
      progress = setEntryProgress(progress, id, {
        ...makeInitialProgress(id),
        totalAnswered: 1,
        lastAnsweredAt: fromLocalDate('2026-09-10').getTime(),
      });
    }
    const st = planState({
      plan,
      progress,
      now: fromLocalDate('2026-09-10').getTime(),
    });
    expect(st.acquisitionComplete).toBe(true);
    expect(planComplete(plan, progress)).toBe(true);
  });
});

// —— 當日完成判定 ——

describe('todayProgress / answeredToday', () => {
  const date = '2026-09-10';
  const dayStart = fromLocalDate(date).getTime();

  it('counts only answers made today, not earlier ones', () => {
    const snapshot = {
      day: 1,
      date,
      newEntries: [{ unit: '11', entryIds: ['u11:bed'] }],
      requiredReview: [{ unit: '11', entryIds: ['u11:apple'] }],
      optionalStrong: [],
    };
    // u11:apple 昨天答過（複習任務昨天就存在），今天沒答 → 未完成。
    let progress = emptyProgress();
    progress = setEntryProgress(progress, 'u11:apple', {
      ...makeInitialProgress('u11:apple'),
      totalAnswered: 3,
      lastAnsweredAt: dayStart - 86400000,
    });
    const tp = todayProgress(snapshot, progress);
    expect(tp.reviewDone).toBe(0);
    expect(tp.done).toBe(false);

    // 今天答一次（即使答錯）→ 完成。
    progress = setEntryProgress(progress, 'u11:apple', {
      ...progress.entries['u11:apple'],
      totalAnswered: 4,
      lastAnsweredAt: dayStart + 1000,
    });
    const tp2 = todayProgress(snapshot, progress);
    expect(tp2.reviewDone).toBe(1);
    // u11:bed（新字）還沒答。
    expect(tp2.newDone).toBe(0);
    expect(tp2.done).toBe(false);

    progress = setEntryProgress(progress, 'u11:bed', {
      ...makeInitialProgress('u11:bed'),
      totalAnswered: 1,
      lastAnsweredAt: dayStart + 2000,
    });
    const tp3 = todayProgress(snapshot, progress);
    expect(tp3.done).toBe(true);
  });

  it('answeredToday handles midnight boundary', () => {
    let progress = emptyProgress();
    progress = setEntryProgress(progress, 'u11:bed', {
      ...makeInitialProgress('u11:bed'),
      totalAnswered: 1,
      lastAnsweredAt: fromLocalDate(date).getTime(),
    });
    expect(answeredToday('u11:bed', date, progress)).toBe(true);
    // 前一天 23:59 → 不算今天
    progress = setEntryProgress(progress, 'u11:apple', {
      ...makeInitialProgress('u11:apple'),
      totalAnswered: 1,
      lastAnsweredAt: fromLocalDate(date).getTime() - 60 * 1000,
    });
    expect(answeredToday('u11:apple', date, progress)).toBe(false);
  });
});

// —— ProgressData 型別確認（避免 studyPlan 與既有進度脫鉤） ——

describe('plan with existing progress', () => {
  it('only allocates unintroduced entries', () => {
    const corpus = buildCorpus();
    const introducedIds = corpus.entryIds.slice(0, 100);
    let progress: ProgressData = emptyProgress();
    for (const id of introducedIds) {
      progress = setEntryProgress(progress, id, {
        ...makeInitialProgress(id),
        totalAnswered: 1,
      });
    }
    const remaining = corpus.entryIds.filter(
      (id) => (progress.entries[id]?.totalAnswered ?? 0) === 0,
    );
    expect(remaining).toHaveLength(corpus.entryIds.length - 100);
    expect(remainingNewIds(corpus, progress)).toEqual(remaining);
  });
});