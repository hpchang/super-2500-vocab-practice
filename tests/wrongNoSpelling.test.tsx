// @vitest-environment jsdom
/**
 * 錯題複習不出拼字（學生要求 2026-09-15）。
 *
 * 覆蓋三層，缺一層就可能有入口漏掉：
 *  1. session schema：excludeSpelling round-trip / 型別驗證 / 不進 SessionResult
 *  2. PracticeScreen 建題：帶 flag 的 mixed session 不含拼字題
 *  3. 各入口帶 flag：錯題頁、結果頁「再練一次」、設定頁「錯題」篩選
 *
 * 第 3 層是這批改動最容易漏的地方（四個入口分散在三個 screen），
 * 所以逐入口斷言 saveSession 的 payload，而不是只驗一處。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import {
  saveSession,
  saveResult,
  loadSession,
  parseSessionConfig,
} from '../src/session.js';
import { PracticeScreen } from '../src/screens/PracticeScreen.js';
import { UnitSetupScreen } from '../src/screens/UnitSetupScreen.js';
import { getUnit, getEntry } from '../src/lib/data.js';
import { resetProgress, updateEntryProgress } from '../src/progressStore.js';
import { recordAnswer } from '../src/lib/scheduler.js';
import { clearCheckpoint } from '../src/lib/checkpoint.js';
import { buildSession } from '../src/lib/questions.js';
import type { VocabEntry } from '../src/types/index.js';

describe('excludeSpelling session schema', () => {
  beforeEach(() => {
    // 這裡用真的 jsdom storage。studyPlanSession.test.ts 是 node 環境才需要
    // 自己 mock window——在 jsdom 檔案裡覆蓋 globalThis.window 會把 React
    // 之後 render 要用的 window 一起換掉（act 直接炸）。
    window.sessionStorage.clear();
  });

  it('round-trips true and omits the field when unset (legacy sessions)', () => {
    const withFlag = {
      unit: '11',
      entryIds: ['u11:bed'],
      type: 'mixed',
      batchSize: 20,
      excludeSpelling: true,
    };
    expect(parseSessionConfig(JSON.stringify(withFlag))).toEqual(withFlag);

    // legacy session 不帶欄位——必須仍可解析且不長出 undefined key。
    const legacy = {
      unit: '11',
      entryIds: ['u11:bed'],
      type: 'mixed',
      batchSize: 20,
    };
    const parsed = parseSessionConfig(JSON.stringify(legacy));
    expect(parsed).toEqual(legacy);
    expect('excludeSpelling' in (parsed as object)).toBe(false);
  });

  it('rejects a non-boolean flag (malformed storage, not legacy)', () => {
    for (const bad of ['yes', 1, null]) {
      expect(
        parseSessionConfig(
          JSON.stringify({
            unit: '11',
            entryIds: ['u11:bed'],
            type: 'mixed',
            batchSize: 20,
            excludeSpelling: bad,
          }),
        ),
      ).toBeNull();
    }
  });
});

describe('PracticeScreen 錯題 session 不出拼字題', () => {
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

  it('mixed + excludeSpelling renders no 拼字 question, and 下一題 never becomes one', async () => {
    // 8 字 × 3 題型（en2zh/zh2en/cloze）= 24 題，輪替跑好幾圈——若拼字還在
    // 輪替裡，不可能整個 session 都不出現（單題抽樣會誤判）。
    const entries = getUnit('11')!.entries.slice(0, 8);
    saveSession({
      unit: '11',
      entryIds: entries.map((e) => e.entryId),
      type: 'mixed',
      batchSize: 8,
      excludeSpelling: true,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<PracticeScreen navigate={() => {}} />);
    });

    // 逐題走完全部：每一題的標籤都不得是拼字，也不得出現拼字輸入框。
    const total = Number(
      (document.querySelector('.qmeta span')?.textContent ?? '').match(
        /\/ (\d+) 題/,
      )?.[1] ?? 0,
    );
    expect(total).toBeGreaterThan(1);

    for (let i = 0; i < total; i++) {
      const label = document.querySelectorAll('.qmeta span')[1]?.textContent ?? '';
      expect(label).not.toContain('拼字');
      expect(document.querySelector('.spell-pad')).toBeNull();

      if (i === total - 1) break;
      // 作答→下一題：選擇題按下第一個選項（答錯也一樣前進）。
      const option = document.querySelector('.option-btn') as HTMLButtonElement;
      await act(async () => {
        option.click();
      });
      const nextBtn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('下一題'),
      ) as HTMLButtonElement | undefined;
      if (nextBtn) {
        await act(async () => {
          nextBtn.click();
        });
      }
    }

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('一般練習（不帶 flag）的混合仍會出拼字題', async () => {
    const entries = getUnit('11')!.entries.slice(0, 8);
    saveSession({
      unit: '11',
      entryIds: entries.map((e) => e.entryId),
      type: 'mixed',
      batchSize: 8,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<PracticeScreen navigate={() => {}} />);
    });

    const total = Number(
      (document.querySelector('.qmeta span')?.textContent ?? '').match(
        /\/ (\d+) 題/,
      )?.[1] ?? 0,
    );
    let sawSpelling = false;
    for (let i = 0; i < total; i++) {
      const label = document.querySelectorAll('.qmeta span')[1]?.textContent ?? '';
      if (label.includes('拼字')) sawSpelling = true;
      const option = document.querySelector('.option-btn') as HTMLButtonElement;
      if (option) {
        await act(async () => {
          option.click();
        });
        const nextBtn = Array.from(document.querySelectorAll('button')).find(
          (b) => b.textContent?.includes('下一題'),
        ) as HTMLButtonElement | undefined;
        if (nextBtn) {
          await act(async () => {
            nextBtn.click();
          });
        }
      } else {
        break;
      }
    }
    expect(sawSpelling).toBe(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('單選拼字題型不受 excludeSpelling 影響', () => {
    const entries = getUnit('11')!.entries
      .slice(0, 2)
      .map((e) => getEntry(e.entryId)!) as VocabEntry[];
    const qs = buildSession(entries, 'spelling', 0, true);
    expect(qs.length).toBe(2);
    expect(qs.every((q) => q.type === 'spelling')).toBe(true);
  });
});

describe('錯題入口帶上 excludeSpelling', () => {
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

  /** 把 Unit 11 前 n 字標成錯題（inWrongQueue）。 */
  function markWrong(n: number): string[] {
    const ids = getUnit('11')!.entries.slice(0, n).map((e) => e.entryId);
    for (const id of ids) {
      updateEntryProgress(id, (prev) => recordAnswer(prev, false, 'cloze', Date.now()));
    }
    return ids;
  }

  it('結果頁「再練錯題」的 session 帶 flag', async () => {
    const { ResultsScreen } = await import('../src/screens/ResultsScreen.js');
    const ids = markWrong(3);
    saveResult({
      unit: '11',
      type: 'mixed',
      results: ids.map((id) => ({ entryId: id, type: 'cloze' as const, correct: false })),
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<ResultsScreen navigate={() => {}} />);
    });

    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('重練這些字'),
    ) as HTMLButtonElement;
    expect(btn).toBeDefined();
    await act(async () => {
      btn.click();
    });

    expect(loadSession()?.excludeSpelling).toBe(true);
    expect(loadSession()?.type).toBe('mixed');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('設定頁篩選「錯題」開始練習的 session 帶 flag', async () => {
    markWrong(3);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <UnitSetupScreen unit="11" navigate={() => {}} filter="wrong" />,
      );
    });

    // 一鍵開始／開始練習都走同一個 start()。
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === '開始練習' || b.textContent === '一鍵開始',
    ) as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });

    expect(loadSession()?.excludeSpelling).toBe(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('設定頁一般篩選（重要字）不帶 flag', async () => {
    markWrong(3);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<UnitSetupScreen unit="11" navigate={() => {}} />);
    });

    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === '一鍵開始',
    ) as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });

    expect(loadSession()?.excludeSpelling).toBe(false);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
