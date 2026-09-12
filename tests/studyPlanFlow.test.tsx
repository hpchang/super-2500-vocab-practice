// @vitest-environment jsdom
/**
 * 計畫 component 回歸：freezeToday 冪等（作答後 snapshot 不變）、
 * Practice 計畫 session 作答一次即完成 task、答錯仍算完成、
 * 同一 task 重複回寫不重複計數、一鍵複習比例列、每日統計與封存。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { StudyPlanScreen } from '../src/screens/StudyPlanScreen.js';
import { resetProgress, getSnapshot, updateEntryProgress } from '../src/progressStore.js';
import {
  startPlan,
  freezeToday,
  getCorpus,
  deletePlan,
  getPlanSnapshot,
  recordPlanAnswer,
  archivePlanDay,
} from '../src/studyPlanStore.js';
import { todayProgress, addDays, toLocalDate } from '../src/lib/studyPlan.js';
import { recordAnswer, makeInitialProgress } from '../src/lib/scheduler.js';
import { setEntryProgress } from '../src/lib/storage.js';
import { loadSession, MULTI_UNIT } from '../src/session.js';
import type { PlanDaySnapshot } from '../src/types/index.js';

async function renderScreen() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<StudyPlanScreen navigate={() => {}} />);
  });
  return { root, container };
}

function cleanup(root: ReturnType<typeof createRoot>, container: HTMLElement) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

describe('study plan screen flow', () => {
  beforeEach(() => {
    resetProgress();
    deletePlan();
  });

  it('freezeToday is idempotent: snapshot unchanged after answering', () => {
    const corpus = getCorpus();
    const firstId = corpus.entryIds[0];
    // 建立計畫並凍結今日。
    let progress = getSnapshot();
    startPlan(progress, { now: Date.now() });
    progress = getSnapshot();
    const snap1 = freezeToday(progress, Date.now());
    expect(snap1).not.toBeNull();

    // 作答一個新字 → progress 變了，但同一日的 snapshot 必須沿用。
    updateEntryProgress(firstId, (prev) =>
      recordAnswer(prev, true, 'en2zh', Date.now()),
    );
    const snap2 = freezeToday(getSnapshot(), Date.now());
    expect(snap2).toEqual(snap1);
  });

  it('answering a plan new-word once completes its task; wrong still counts', () => {
    startPlan(getSnapshot(), { now: Date.now() });
    const snap = freezeToday(getSnapshot(), Date.now()) as PlanDaySnapshot;
    const newIds = snap.newEntries.flatMap((g) => g.entryIds);
    expect(newIds.length).toBeGreaterThan(0);
    const target = newIds[0];

    // 答錯：task 仍算完成（lastAnsweredAt 落在今天）。
    act(() => {
      updateEntryProgress(target, (prev) =>
        recordAnswer(prev, false, 'en2zh', Date.now()),
      );
    });
    const tp = todayProgress(snap, getSnapshot());
    expect(tp.newDone).toBe(1);
    expect(tp.newTotal).toBe(newIds.length);
    // 答錯也進錯題佇列。
    expect(getSnapshot().entries[target].inWrongQueue).toBe(true);
  });

  it('repeated write-back / reload does not double-count', () => {
    const corpus = getCorpus();
    const firstId = corpus.entryIds[0];
    startPlan(getSnapshot(), { now: Date.now() });
    const snap = freezeToday(getSnapshot(), Date.now()) as PlanDaySnapshot;

    // 模擬同一 task 重複回寫（Results reload、checkpoint 恢復後再回寫）：
    // answeredToday 以 lastAnsweredAt 判定，重複標記不會增加完成數。
    act(() => {
      updateEntryProgress(firstId, (prev) =>
        recordAnswer(prev, true, 'en2zh', Date.now()),
      );
    });
    const tp1 = todayProgress(snap, getSnapshot());
    act(() => {
      updateEntryProgress(firstId, (prev) =>
        recordAnswer(prev, true, 'en2zh', Date.now()),
      );
    });
    const tp2 = todayProgress(snap, getSnapshot());
    expect(tp2.newDone).toBe(tp1.newDone);
    expect(tp2.newDone).toBe(1);
  });

  it('yesterday-answered required review is not auto-completed today', () => {
    const corpus = getCorpus();
    // 手動造一個昨天答過、在錯題佇列的字，放進今日 snapshot 的必做複習。
    const id = corpus.entryIds[0];
    let progress = getSnapshot();
    progress = setEntryProgress(progress, id, {
      ...makeInitialProgress(id),
      stage: 'learning',
      totalAnswered: 2,
      inWrongQueue: true,
      lastAnsweredAt: Date.now() - 86400000,
    });
    const snap: PlanDaySnapshot = {
      day: 2,
      date: new Date().toLocaleDateString('sv-SE'),
      newEntries: [],
      requiredReview: [
        {
          unit: id.slice(1, id.indexOf(':')),
          entryIds: [id],
        },
      ],
      optionalStrong: [],
    };
    const tp = todayProgress(snap, progress);
    expect(tp.reviewTotal).toBe(1);
    expect(tp.reviewDone).toBe(0);
    expect(tp.done).toBe(false);
  });

  it('create plan view shows corpus size and renders plan after creation', async () => {
    const { root, container } = await renderScreen();
    // 尚未建立計畫 → 建立頁。
    expect(container.textContent).toContain('建立計畫');
    expect(container.textContent).toMatch(/計畫字數/);
    cleanup(root, container);

    // 建立計畫後 → 進行中視圖。
    startPlan(getSnapshot(), { now: Date.now() });
    freezeToday(getSnapshot(), Date.now());
    const { root: root2, container: c2 } = await renderScreen();
    expect(c2.textContent).toContain('今日任務');
    expect(c2.textContent).toContain('90 天學習計畫');
    cleanup(root2, c2);
  });

  it('one-click ratio row starts a MULTI_UNIT session with all pending and ratio batchSize', async () => {
    const corpus = getCorpus();
    // 造 6 個跨兩個 Unit 的錯題字（required-review）：計畫昨天開始，
    // 昨天把這些字答錯（進錯題佇列）→ 今天必做複習應含全部。
    const ids = corpus.entryIds.slice(0, 6);
    const yesterday = Date.now() - 86400000;
    for (const id of ids) {
      act(() => {
        updateEntryProgress(id, (prev) =>
          recordAnswer(prev, false, 'en2zh', yesterday),
        );
      });
    }
    startPlan(getSnapshot(), { now: Date.now(), startDate: toLocalDate(new Date(yesterday)) });
    const snap = freezeToday(getSnapshot(), Date.now()) as PlanDaySnapshot;
    const flatIds = snap.requiredReview.flatMap((g) => g.entryIds);
    expect(flatIds).toEqual(ids);

    const { root, container } = await renderScreen();
    // 必做複習卡出現一鍵列；今日新字卡沒有。
    const ratioRows = container.querySelectorAll('.ratio-row');
    expect(ratioRows.length).toBe(1);
    const btns = [...ratioRows[0].querySelectorAll('button')];
    expect(btns.map((b) => b.textContent)).toEqual([
      '1/3 · 2 字',
      '1/2 · 3 字',
      '2/3 · 4 字',
      '全部 · 6 字',
    ]);

    // 點「1/3」→ session：unit=multi、entryIds=全部 6 個、batchSize=2。
    act(() => {
      btns[0].click();
    });
    const cfg = loadSession();
    expect(cfg).not.toBeNull();
    expect(cfg!.unit).toBe(MULTI_UNIT);
    expect(cfg!.plan!.unit).toBe(MULTI_UNIT);
    expect(cfg!.plan!.section).toBe('required-review');
    expect(cfg!.entryIds).toEqual(ids);
    expect(cfg!.batchSize).toBe(2);

    // 「全部」→ batchSize = pending 總數。
    act(() => {
      btns[3].click();
    });
    expect(loadSession()!.batchSize).toBe(6);
    cleanup(root, container);
  });

  it('ratio row hidden when all pending answered; per-unit pending uses answeredToday', async () => {
    const corpus = getCorpus();
    // 錯題字昨天答錯進必做；今天再答過 → 一鍵列不顯示，逐 Unit 顯示「已完成」。
    const id = corpus.entryIds[0];
    const yesterday = Date.now() - 86400000;
    act(() => {
      updateEntryProgress(id, (prev) => recordAnswer(prev, false, 'en2zh', yesterday));
    });
    startPlan(getSnapshot(), { now: Date.now(), startDate: toLocalDate(new Date(yesterday)) });
    const snap = freezeToday(getSnapshot(), Date.now()) as PlanDaySnapshot;
    expect(snap.requiredReview.flatMap((g) => g.entryIds)).toContain(id);
    // 今天答過（answeredToday）→ 不再是 pending。
    act(() => {
      updateEntryProgress(id, (prev) => recordAnswer(prev, true, 'en2zh', Date.now()));
    });

    const { root, container } = await renderScreen();
    const rrCard = [...container.querySelectorAll('.card')].find((c) =>
      c.querySelector('.section-title')?.textContent?.includes('必做複習'),
    );
    expect(rrCard).toBeDefined();
    expect(rrCard!.querySelector('.ratio-row')).toBeNull();
    expect(rrCard!.textContent).toContain('已完成');
    cleanup(root, container);
  });

  it('recordPlanAnswer accumulates per date; archivePlanDay preserves stats and is idempotent', () => {
    const now = Date.now();
    const yesterday = addDays(toLocalDate(new Date(now)), -1);
    // 計畫昨天開始（昨日造的錯題字由 archive 測試涵蓋）；此處只驗證
    // recordPlanAnswer 的純統計行為。
    startPlan(getSnapshot(), { now, startDate: yesterday });

    recordPlanAnswer(yesterday, 2, 1, now);
    recordPlanAnswer(toLocalDate(new Date(now)), 5, 4, now);
    recordPlanAnswer(toLocalDate(new Date(now)), 3, 3, now);
    const plan = getPlanSnapshot()!;
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0].date).toBe(yesterday);
    expect(plan.days[0].answered).toBe(2);
    expect(plan.days[0].correct).toBe(1);
    expect(plan.days[1].date).toBe(toLocalDate(new Date(now)));
    expect(plan.days[1].answered).toBe(8);
    expect(plan.days[1].correct).toBe(7);
    // 封存前：completed 尚未補上。
    expect(plan.days[1].completed).toBe(false);
    expect(plan.days[1].newCount).toBe(0);
  });

  it('archivePlanDay archives yesterday, preserves stats, and is idempotent', () => {
    const now = Date.now();
    const yesterday = addDays(toLocalDate(new Date(now)), -1);
    // 計畫昨天開始，昨日凍結的 snapshot 含一個錯題字；該字昨日已答過
    // （答錯也算完成）→ 封存後 completed 為 true。
    const id = getCorpus().entryIds[0];
    act(() => {
      updateEntryProgress(id, (prev) =>
        recordAnswer(prev, false, 'en2zh', new Date(yesterday).setHours(12)),
      );
    });
    startPlan(getSnapshot(), { now, startDate: yesterday });
    // 昨日作答統計先寫入。
    recordPlanAnswer(yesterday, 2, 1, now);
    // 把 store.today 換成昨日 snapshot（freezeToday 以真實現在時間凍結，
    // 無法指定日期；直接寫入經 loadPlan 驗證的合法計畫 JSON 後觸發同步）。
    const plan0 = getPlanSnapshot()!;
    const yesterdaySnap: PlanDaySnapshot = {
      day: 1,
      date: yesterday,
      newEntries: [],
      requiredReview: [
        { unit: id.slice(1, id.indexOf(':')), entryIds: [id] },
      ],
      optionalStrong: [],
    };
    const withSnap = { ...plan0, today: yesterdaySnap };
    window.localStorage.setItem(
      'vocab-super2500-study-plan',
      JSON.stringify(withSnap),
    );
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'vocab-super2500-study-plan',
        newValue: JSON.stringify(withSnap),
      }),
    );
    expect(getPlanSnapshot()!.today?.date).toBe(yesterday);

    // 封存昨日：completed 補上、answered/correct 保留。
    archivePlanDay(getSnapshot(), now);
    let rec = getPlanSnapshot()!.days.find((d) => d.date === yesterday)!;
    expect(rec.completed).toBe(true);
    expect(rec.reviewCount).toBe(1);
    expect(rec.answered).toBe(2);
    expect(rec.correct).toBe(1);
    // 冪等：重複呼叫不重複寫入。
    const daysCount = getPlanSnapshot()!.days.length;
    archivePlanDay(getSnapshot(), now);
    expect(getPlanSnapshot()!.days).toHaveLength(daysCount);

    // 今天（同日）不封存：今日 record 不會被補 completed。
    const today = toLocalDate(new Date(now));
    recordPlanAnswer(today, 1, 0, now);
    const before = getPlanSnapshot()!.days.find((d) => d.date === today)!;
    expect(before.completed).toBe(false);
    archivePlanDay(getSnapshot(), now);
    const after = getPlanSnapshot()!.days.find((d) => d.date === today)!;
    expect(after.completed).toBe(false);
    expect(after.answered).toBe(before.answered);
  });

  it('archivePlanDay fills an empty day record so the day grid stays contiguous', () => {
    const now = Date.now();
    const yesterday = addDays(toLocalDate(new Date(now)), -1);
    startPlan(getSnapshot(), { now, startDate: yesterday });
    // 昨日 snapshot（零任務）。
    const plan0 = getPlanSnapshot()!;
    const yesterdaySnap: PlanDaySnapshot = {
      day: 1,
      date: yesterday,
      newEntries: [],
      requiredReview: [],
      optionalStrong: [],
    };
    const withSnap = { ...plan0, today: yesterdaySnap };
    window.localStorage.setItem(
      'vocab-super2500-study-plan',
      JSON.stringify(withSnap),
    );
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'vocab-super2500-study-plan',
        newValue: JSON.stringify(withSnap),
      }),
    );

    archivePlanDay(getSnapshot(), now);
    const plan = getPlanSnapshot()!;
    const rec = plan.days.find((d) => d.date === yesterday)!;
    expect(rec.answered).toBe(0);
    expect(rec.correct).toBe(0);
    expect(rec.newCount).toBe(0);
    expect(rec.reviewCount).toBe(0);
    // 零任務日：done 條件（0===0）成立 → completed 為 true。
    expect(rec.completed).toBe(true);
  });

  it('streak in 計畫成效 counts today before it is archived', async () => {
    const corpus = getCorpus();
    // 造一個今日必做字並答完 → todayTp.done → streak 至少 1（今日未封存）。
    // 注意：todayProgress.done 要求「必做複習＋新字全部完成」——空 progress
    // 的首日新字配額約 28 字，全部作答後才算 done。
    const yesterday = Date.now() - 86400000;
    act(() => {
      updateEntryProgress(corpus.entryIds[0], (prev) =>
        recordAnswer(prev, false, 'en2zh', yesterday),
      );
    });
    startPlan(getSnapshot(), { now: Date.now(), startDate: toLocalDate(new Date(yesterday)) });
    const snap = freezeToday(getSnapshot(), Date.now()) as PlanDaySnapshot;
    const taskIds = [
      ...snap.requiredReview.flatMap((g) => g.entryIds),
      ...snap.newEntries.flatMap((g) => g.entryIds),
    ];
    expect(taskIds.length).toBeGreaterThan(0);
    for (const tid of taskIds) {
      act(() => {
        updateEntryProgress(tid, (prev) => recordAnswer(prev, true, 'en2zh', Date.now()));
      });
    }

    const { root, container } = await renderScreen();
    const perfCard = [...container.querySelectorAll('.card')].find((c) =>
      c.querySelector('.section-title')?.textContent === '計畫成效',
    );
    expect(perfCard).toBeDefined();
    expect(perfCard!.textContent).toContain('連續完成');
    const kpis = [...perfCard!.querySelectorAll('.kpi')];
    const streak = kpis.find((k) => k.textContent?.includes('連續完成'));
    expect(streak!.querySelector('.kpi-value')!.textContent).toBe('1');
    cleanup(root, container);
  });

  it('saveResult for a plan session records daily stats', async () => {
    const { saveResult } = await import('../src/session.js');
    const now = Date.now();
    startPlan(getSnapshot(), { now });
    saveResult({
      unit: '11',
      type: 'mixed',
      plan: {
        planId: getPlanSnapshot()!.planId,
        date: toLocalDate(new Date(now)),
        section: 'required-review',
        unit: '11',
      },
      results: [
        { entryId: 'u11:x', type: 'en2zh', correct: true },
        { entryId: 'u11:y', type: 'cloze', correct: false },
      ],
    });
    const rec = getPlanSnapshot()!.days.find((d) =>
      d.date === toLocalDate(new Date(now)),
    );
    expect(rec?.answered).toBe(2);
    expect(rec?.correct).toBe(1);
  });

  it('ResultsScreen after a partial multi review shows 繼續複習 CTA that starts a new multi session', async () => {
    const { ResultsScreen } = await import('../src/screens/ResultsScreen.js');
    const { saveResult } = await import('../src/session.js');
    const corpus = getCorpus();
    // 4 個錯題字：批次 1 練 2 個（今天答過）→ 剩 2 個 pending。
    const ids = corpus.entryIds.slice(0, 4);
    const yesterday = Date.now() - 86400000;
    for (const id of ids) {
      act(() => {
        updateEntryProgress(id, (prev) =>
          recordAnswer(prev, false, 'en2zh', yesterday),
        );
      });
    }
    startPlan(getSnapshot(), { now: Date.now(), startDate: toLocalDate(new Date(yesterday)) });
    freezeToday(getSnapshot(), Date.now());
    // 完成第 1 批（前 2 個字今天答過）。
    for (const id of ids.slice(0, 2)) {
      act(() => {
        updateEntryProgress(id, (prev) => recordAnswer(prev, true, 'en2zh', Date.now()));
      });
    }

    saveResult({
      unit: MULTI_UNIT,
      type: 'mixed',
      plan: {
        planId: getPlanSnapshot()!.planId,
        date: toLocalDate(new Date()),
        section: 'required-review',
        unit: MULTI_UNIT,
      },
      results: [
        { entryId: ids[0], type: 'en2zh', correct: true },
        { entryId: ids[1], type: 'en2zh', correct: true },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<ResultsScreen navigate={() => {}} />);
    });

    const cta = [...container.querySelectorAll('.btn-row .btn')].find((b) =>
      b.textContent?.includes('繼續複習'),
    ) as HTMLButtonElement | undefined;
    expect(cta).toBeDefined();
    expect(cta!.textContent).toContain('2 字');
    act(() => {
      cta!.click();
    });
    const cfg = loadSession();
    expect(cfg!.unit).toBe(MULTI_UNIT);
    expect(cfg!.plan!.unit).toBe(MULTI_UNIT);
    expect(cfg!.plan!.section).toBe('required-review');
    expect(cfg!.batchSize).toBe(2);
    expect(cfg!.entryIds).toEqual(ids.slice(2));

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('ResultsScreen after an optional-strong session offers required-review CTA tagged required-review', async () => {
    const { ResultsScreen } = await import('../src/screens/ResultsScreen.js');
    const { saveResult } = await import('../src/session.js');
    const corpus = getCorpus();
    // 兩個錯題字（今日必做複習的剩餘）；完成的 session 是 optional-strong。
    const ids = corpus.entryIds.slice(0, 2);
    const yesterday = Date.now() - 86400000;
    for (const id of ids) {
      act(() => {
        updateEntryProgress(id, (prev) =>
          recordAnswer(prev, false, 'en2zh', yesterday),
        );
      });
    }
    startPlan(getSnapshot(), { now: Date.now(), startDate: toLocalDate(new Date(yesterday)) });
    freezeToday(getSnapshot(), Date.now());

    saveResult({
      unit: MULTI_UNIT,
      type: 'mixed',
      plan: {
        planId: getPlanSnapshot()!.planId,
        date: toLocalDate(new Date()),
        section: 'optional-strong',
        unit: MULTI_UNIT,
      },
      results: [{ entryId: ids[0], type: 'en2zh', correct: true }],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<ResultsScreen navigate={() => {}} />);
    });

    // 續批 CTA 出現（multiPending 來自 requiredReview）。
    const cta = [...container.querySelectorAll('.btn-row .btn')].find((b) =>
      b.textContent?.includes('繼續複習'),
    ) as HTMLButtonElement | undefined;
    expect(cta).toBeDefined();
    act(() => {
      cta!.click();
    });
    const cfg = loadSession();
    // section 標籤必須與 entryIds 一致：multiPending 來自 requiredReview，
    // 完成的 session 是 optional-strong 也不得沿用其 section。
    expect(cfg!.plan!.section).toBe('required-review');
    expect(cfg!.entryIds).toEqual(ids);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

