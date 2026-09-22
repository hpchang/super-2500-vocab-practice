// @vitest-environment jsdom
/**
 * 混合練習的填空題改接適性題庫（2026-09）。
 *
 * 缺陷：混合（預設題型）每一輪的填空格都出 legacy `enriched.cloze`，那批題的
 * 干擾項未達「決定性線索」標準（同義項、語法不合、無關送分項），學生回報 24 題。
 * 修法：混合的填空格改由適性題庫（clozeEasy/clozeMedium/clozeHard）出題，與
 * 「情境填空」題型共用同一份適性進度。
 *
 * 這些測試對舊程式碼必須轉紅（混合填空不帶 clozeDifficulty、題幹取自 legacy）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PracticeScreen } from '../src/screens/PracticeScreen.js';
import { saveSession } from '../src/session.js';
import { resetProgress } from '../src/progressStore.js';
import { getUnit } from '../src/lib/data.js';
import { buildSession, buildClozeSession } from '../src/lib/questions.js';
import { clozeQuestionsForEntry } from '../src/lib/clozeGenerator.js';
import { makeInitialProgress } from '../src/lib/scheduler.js';

function Harness() {
  const [screen, setScreen] = useState('practice');
  return (
    <div data-testid="root">
      {screen === 'practice' && (
        <PracticeScreen navigate={(to: string) => setScreen(to)} />
      )}
      {screen === 'results' && <div data-testid="results-screen" />}
    </div>
  );
}

async function renderPractice() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Harness />);
  });
  return { root, container };
}

function getPrompt(): string {
  const el = document.querySelector('.qprompt');
  return el ? (el.textContent ?? '') : '';
}

describe('混合練習的填空走適性題庫', () => {
  beforeEach(() => resetProgress());
  afterEach(() => {
    resetProgress();
    document.body.innerHTML = '';
  });

  it('混合 session 的填空題帶適性難度，題幹取自適性題庫', () => {
    const entries = getUnit('11')!.entries.slice(0, 8);
    const qs = buildSession(entries, 'mixed', 0, false, {});
    const clozeQs = qs.filter((q) => q.type === 'cloze');
    expect(clozeQs.length).toBeGreaterThan(0);

    for (const q of clozeQs) {
      // 適性題一定帶 clozeDifficulty/clozeVariant；缺一即代表沒走題庫
      // （且該題就不會記錄 clozeUsed，適性進度會靜默流失）。
      expect(q.clozeDifficulty, `${q.entryId} 應帶適性難度`).toBeDefined();
      expect(q.clozeVariant, `${q.entryId} 應帶 variant`).toBeDefined();
      // 與對應的適性題庫題逐字相同。
      const pool = clozeQuestionsForEntry(q.entryId)[q.clozeDifficulty!];
      expect(pool[q.clozeVariant!].sentence).toBe(q.prompt);
    }
  });

  it('混合的填空題與「情境填空」題型在同一份進度下選出同一題', () => {
    const entries = getUnit('11')!.entries.slice(0, 8);
    const progress = {
      [entries[0].entryId]: {
        ...makeInitialProgress(entries[0].entryId),
        totalAnswered: 3,
        totalCorrect: 2,
        streak: 1,
        wrongCount: 0,
        clozeUsed: { medium: [0] },
      },
    };
    const mixedQs = buildSession(entries, 'mixed', 0, false, progress).filter(
      (q) => q.type === 'cloze',
    );
    const clozeQs = buildClozeSession(entries, 'adaptive', progress, 0);
    for (const q of mixedQs) {
      const same = clozeQs.find((c) => c.entryId === q.entryId);
      expect(same, `${q.entryId} 應也在情境填空 session 中`).toBeDefined();
      expect(q.prompt).toBe(same!.prompt);
      expect(q.clozeDifficulty).toBe(same!.clozeDifficulty);
      expect(q.clozeVariant).toBe(same!.clozeVariant);
    }
  });

  it('混合填空每字一題（題數 == entries 數）', () => {
    const entries = getUnit('11')!.entries.slice(0, 10);
    expect(buildSession(entries, 'mixed', 0, false, {}).length).toBe(entries.length);
  });

  it('混合填空的難度與 variant 隨 progress 改變（真的讀進度）', () => {
    const entry = getUnit('11')!.entries[0];
    // round 2 讓單一 entry 落在填空格（types[2] === 'cloze'）。
    const struggling = {
      ...makeInitialProgress(entry.entryId),
      totalAnswered: 4,
      totalCorrect: 1, // accuracy 0.25 → easy
      streak: 0,
      wrongCount: 2,
    };
    const strong = {
      ...makeInitialProgress(entry.entryId),
      totalAnswered: 5,
      totalCorrect: 5, // accuracy 1.0 → hard
      streak: 3,
      wrongCount: 0,
    };

    const easyQ = buildSession([entry], 'mixed', 2, false, {
      [entry.entryId]: struggling,
    })[0];
    expect(easyQ.type).toBe('cloze');
    expect(easyQ.clozeDifficulty).toBe('easy');

    const hardQ = buildSession([entry], 'mixed', 2, false, {
      [entry.entryId]: strong,
    })[0];
    expect(hardQ.type).toBe('cloze');
    expect(hardQ.clozeDifficulty).toBe('hard');

    // 用過的 variant 會被避開：medium 有 2 題，用掉 0 就出 1。
    const mediumA = buildSession([entry], 'mixed', 2, false, {})[0];
    expect(mediumA.clozeDifficulty).toBe('medium');
    expect(mediumA.clozeVariant).toBe(0);
    const mediumB = buildSession([entry], 'mixed', 2, false, {
      [entry.entryId]: {
        ...makeInitialProgress(entry.entryId),
        totalAnswered: 3,
        totalCorrect: 2, // accuracy 0.67 → medium
        streak: 1,
        wrongCount: 0,
        clozeUsed: { medium: [0] },
      },
    })[0];
    expect(mediumB.clozeDifficulty).toBe('medium');
    expect(mediumB.clozeVariant).toBe(1);
  });

  it('作答其他題不會擾動未作答的填空題（next() 重建穩定）', () => {
    const entries = getUnit('11')!.entries.slice(0, 4);
    const before = buildSession(entries, 'mixed', 0, false, {});
    const clozeBefore = before.find((q) => q.type === 'cloze')!;
    const other = before.find((q) => q.type !== 'cloze')!;
    expect(clozeBefore).toBeDefined();
    expect(other.entryId).not.toBe(clozeBefore.entryId);

    // 模擬「作答 other 那題」後的進度（答錯），再重建。
    const after = buildSession(entries, 'mixed', 0, false, {
      [other.entryId]: {
        ...makeInitialProgress(other.entryId),
        totalAnswered: 1,
        totalWrong: 1,
        streak: 0,
        wrongCount: 1,
        inWrongQueue: true,
      },
    });
    const clozeAfter = after.find((q) => q.type === 'cloze')!;
    expect(clozeAfter.entryId).toBe(clozeBefore.entryId);
    expect(clozeAfter.prompt).toBe(clozeBefore.prompt);
    expect(clozeAfter.options).toEqual(clozeBefore.options);
  });

  it('混合 session 畫面：填空題幹取自適性題庫，且不顯示難度標籤', async () => {
    const entry = getUnit('11')!.entries.find(
      (e) => clozeQuestionsForEntry(e.entryId).medium.length > 0,
    )!;
    const expected = clozeQuestionsForEntry(entry.entryId).medium[0].sentence;

    saveSession({
      unit: '11',
      entryIds: [entry.entryId],
      type: 'mixed',
      batchSize: 1,
      round: 2, // types[2] === 'cloze'
    });

    const { root } = await renderPractice();

    const prompt = getPrompt();
    expect(prompt).toBe(expected);
    // 混合不顯示簡易／中等／艱難。
    expect(document.querySelector('.diff-badge')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('情境填空題型仍顯示難度標籤（回歸：不要誤刪）', async () => {
    const entry = getUnit('11')!.entries.find(
      (e) => clozeQuestionsForEntry(e.entryId).medium.length > 0,
    )!;
    saveSession({
      unit: '11',
      entryIds: [entry.entryId],
      type: 'cloze',
      batchSize: 1,
      difficulty: 'medium',
    });

    const { root } = await renderPractice();
    expect(document.querySelector('.diff-badge')).not.toBeNull();
    expect(document.querySelector('.diff-badge')!.textContent).toContain('中等');

    await act(async () => {
      root.unmount();
    });
  });
});
