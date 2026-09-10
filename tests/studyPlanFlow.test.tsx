// @vitest-environment jsdom
/**
 * 計畫 component 回歸：freezeToday 冪等（作答後 snapshot 不變）、
 * Practice 計畫 session 作答一次即完成 task、答錯仍算完成、
 * 同一 task 重複回寫不重複計數。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { StudyPlanScreen } from '../src/screens/StudyPlanScreen.js';
import { resetProgress, getSnapshot, updateEntryProgress } from '../src/progressStore.js';
import { startPlan, freezeToday, getCorpus, deletePlan } from '../src/studyPlanStore.js';
import { todayProgress } from '../src/lib/studyPlan.js';
import { recordAnswer, makeInitialProgress } from '../src/lib/scheduler.js';
import { setEntryProgress } from '../src/lib/storage.js';
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
});