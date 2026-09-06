// @vitest-environment jsdom
/**
 * 學習分析規劃展示頁（/analytics, LearningAnalyticsScreen）。
 *
 * Display-only 保證：
 *  - 首屏聲明「規劃展示 · 尚未啟用」且不計時、不新增資料
 *  - 四象限每格有完整文字條件（不依賴顏色或 class）
 *  - render 前後不新增任何 storage key（不偷開 analytics）
 *  - 返回按鈕導航回首頁
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { LearningAnalyticsScreen } from '../src/screens/LearningAnalyticsScreen.js';

const LS_BEFORE_KEY = () =>
  new Set(Object.keys(window.localStorage));
const SS_BEFORE_KEY = () =>
  new Set(Object.keys(window.sessionStorage));

async function renderScreen(navigate: (to: string) => void) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<LearningAnalyticsScreen navigate={navigate} />);
  });
  return { root, container };
}

describe('LearningAnalyticsScreen（規劃展示頁）', () => {
  let lsBefore: Set<string>;
  let ssBefore: Set<string>;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    // 既有資料存在時（progress/history），展示頁也不得改動它們。
    window.localStorage.setItem('vocab-super2500-progress', '{"schemaVersion":1,"entries":{}}');
    lsBefore = LS_BEFORE_KEY();
    ssBefore = SS_BEFORE_KEY();
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.body.innerHTML = '';
  });

  it('顯示規劃展示聲明與未啟用說明', async () => {
    const { root } = await renderScreen(() => {});
    const header = document.querySelector('.app-header');
    expect(header?.textContent).toContain('答題時間與學習分析');
    expect(header?.textContent).toContain('規劃展示');
    const note = document.querySelector('.note');
    expect(note?.textContent).toContain('規劃展示');
    expect(note?.textContent).toContain('不會開始計時');
    await act(async () => {
      root.unmount();
    });
  });

  it('四象限四格各有完整文字條件與保守文案', async () => {
    const { root } = await renderScreen(() => {});
    const cells = document.querySelectorAll('.quadrant-cell');
    expect(cells.length).toBe(4);
    const titles = [...cells].map((c) =>
      c.querySelector('.quadrant-title')?.textContent ?? '',
    );
    // 每格標題必須同時含正誤與快慢條件，不能只靠位置或顏色。
    expect(titles).toContain('答對 · 相對較快');
    expect(titles).toContain('答對 · 相對較慢');
    expect(titles).toContain('答錯 · 相對較慢');
    expect(titles).toContain('答錯 · 相對較快');
    for (const cell of cells) {
      // 每格都要有解讀（read）與行動建議（action），而非只有標籤。
      expect(cell.querySelector('.quadrant-read')?.textContent).toBeTruthy();
      expect(cell.querySelector('.quadrant-action')?.textContent).toBeTruthy();
    }
    // 不使用確定性標籤（avoid 欄位會引用「不可推論」的詞，屬規劃說明；
    // 面向學生的解讀與行動建議不得出現評價性文字）。
    for (const cell of cells) {
      const studentFacing = `${cell.querySelector('.quadrant-title')?.textContent ?? ''}${cell.querySelector('.quadrant-read')?.textContent ?? ''}${cell.querySelector('.quadrant-action')?.textContent ?? ''}`;
      expect(studentFacing).not.toContain('你太慢');
      expect(studentFacing).not.toContain('不專心');
      expect(studentFacing).not.toContain('能力不足');
    }
    await act(async () => {
      root.unmount();
    });
  });

  it('包含第一版必做、分階段 roadmap 與隱私說明', async () => {
    const { root } = await renderScreen(() => {});
    const text = document.body.textContent ?? '';
    expect(text).toContain('第一版一定要有');
    expect(text).toContain('計時品質');
    expect(text).toContain('分階段實作');
    expect(text).toContain('Phase 0');
    expect(text).toContain('Phase 3');
    expect(text).toContain('資料隱私與限制');
    expect(text).toContain('只保存在這個瀏覽器');
    await act(async () => {
      root.unmount();
    });
  });

  it('render 前後不新增任何 storage key', async () => {
    const { root } = await renderScreen(() => {});
    expect(Object.keys(window.localStorage)).toEqual([...lsBefore]);
    expect(Object.keys(window.sessionStorage)).toEqual([...ssBefore]);
    await act(async () => {
      root.unmount();
    });
    expect(Object.keys(window.localStorage)).toEqual([...lsBefore]);
  });

  it('返回按鈕呼叫 navigate("/")', async () => {
    const paths: string[] = [];
    const { root } = await renderScreen((to) => paths.push(to));
    const back = document.querySelector<HTMLButtonElement>('.back-btn');
    expect(back).not.toBeNull();
    await act(async () => {
      back!.click();
    });
    expect(paths).toEqual(['/']);
    await act(async () => {
      root.unmount();
    });
  });
});