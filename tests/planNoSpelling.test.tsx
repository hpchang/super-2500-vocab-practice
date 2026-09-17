// @vitest-environment jsdom
/**
 * 計畫複習不出拼字（CLAUDE.md 規則；機制是 session.plan != null）。
 *
 * 這條規則目前沒有守護測試：questions.test.ts 驗的是 buildSession 的
 * 第四個參數（excludeSpelling），practiceMulti.test.tsx 驗的是標題與
 * 切批——兩者都沒驗「plan session 走進 PracticeScreen 之後真的不含拼字」。
 * 這支補上：逐題走完整個 session，斷言沒有任何一題是拼字。
 *
 * 兩個計畫入口各驗一次（跨 Unit 一鍵複習 / 單一 Unit 逐組），因為
 * PracticeScreen 只從 session 的欄位判斷，而兩條路徑的 session 形狀不同。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PracticeScreen } from '../src/screens/PracticeScreen.js';
import { saveSession, MULTI_UNIT } from '../src/session.js';
import { resetProgress } from '../src/progressStore.js';
import { getUnit } from '../src/lib/data.js';
import { clearCheckpoint } from '../src/lib/checkpoint.js';

/** 逐題走完 session，回傳每一題的題型標籤。 */
async function labelsForWholeSession(): Promise<string[]> {
  const total = Number(
    (document.querySelector('.qmeta span')?.textContent ?? '').match(
      /\/ (\d+) 題/,
    )?.[1] ?? 0,
  );
  expect(total).toBeGreaterThan(1);
  const labels: string[] = [];
  for (let i = 0; i < total; i++) {
    labels.push(document.querySelectorAll('.qmeta span')[1]?.textContent ?? '');
    if (i === total - 1) break;
    // 計畫複習的輪替只有選擇題（en2zh/zh2en/cloze），一律有選項可按；
    // 若真出了拼字題，這裡會找不到 .option-btn 而停在原地，總數對不上。
    const option = document.querySelector('.option-btn') as HTMLButtonElement | null;
    if (!option) break;
    await act(async () => {
      option.click();
    });
    const nextBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('下一題'),
    ) as HTMLButtonElement | undefined;
    if (nextBtn) {
      await act(async () => {
        nextBtn.click();
      });
    }
  }
  return labels;
}

describe('90 天計畫複習不出拼字題', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetProgress();
  });

  afterEach(() => {
    clearCheckpoint();
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetProgress();
    document.body.innerHTML = '';
  });

  it('跨 Unit 一鍵複習（unit: multi + plan）：全程無拼字', async () => {
    const ids = [
      ...getUnit('11')!.entries.slice(0, 5).map((e) => e.entryId),
      ...getUnit('12')!.entries.slice(0, 5).map((e) => e.entryId),
    ];
    saveSession({
      unit: MULTI_UNIT,
      entryIds: ids,
      type: 'mixed',
      batchSize: ids.length,
      plan: {
        planId: 'plan-abc',
        date: new Date().toLocaleDateString('sv-SE'),
        section: 'required-review',
        unit: MULTI_UNIT,
      },
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<PracticeScreen navigate={() => {}} />);
    });

    const labels = await labelsForWholeSession();
    // 先斷言「沒有拼字」（訊息直接指出違規），再斷言走完全部——否則
    // 撞到拼字題時走不下去，只會看到長度對不上、看不出原因。
    expect(labels.some((l) => l.includes('拼字'))).toBe(false);
    // 走完全部（不是只抽一題）——拼字若還在輪替裡，10 字跑好幾圈不可能全程不出。
    expect(labels.length).toBe(ids.length);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('單一 Unit 計畫複習（plan，無旗標）：全程無拼字', async () => {
    const entries = getUnit('11')!.entries.slice(0, 8);
    saveSession({
      unit: '11',
      entryIds: entries.map((e) => e.entryId),
      type: 'mixed',
      batchSize: entries.length,
      plan: {
        planId: 'plan-abc',
        date: new Date().toLocaleDateString('sv-SE'),
        section: 'required-review',
        unit: '11',
      },
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<PracticeScreen navigate={() => {}} />);
    });

    const labels = await labelsForWholeSession();
    expect(labels.some((l) => l.includes('拼字'))).toBe(false);
    expect(labels.length).toBe(entries.length);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
