// @vitest-environment jsdom
/**
 * 回報題目問題（情境填空干擾項）功能測試：
 *  - feedback 後僅 cloze 顯示回報按鈕
 *  - 對話框列出四個選項＋其他
 *  - 送出 → fetch POST 帶 formResponse 欄位（自動帶入 + 勾選項）
 *  - 送出失敗顯示提示、不跳離對話框
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PracticeScreen } from '../src/screens/PracticeScreen.js';
import { saveSession } from '../src/session.js';
import { resetProgress } from '../src/progressStore.js';
import { getUnit } from '../src/lib/data.js';
import { generateClozeForEntry } from '../src/lib/clozeGenerator.js';
import { FORM_CONFIG } from '../src/lib/report.js';

// FORM_CONFIG 目前是 placeholder（等使用者建好 Google Form 填入真值），
// 測試一律視為「已設定」以涵蓋送出流程。
vi.mock('../src/lib/report.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../src/lib/report.js')
  >();
  return { ...actual, isFormConfigured: () => true };
});

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

describe('ReportDialog (回報題目問題)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetProgress();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    resetProgress();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    delete (globalThis as any).fetch;
  });

  /** Seed a cloze session and answer one question so feedback shows. */
  async function answerOneCloze() {
    const unit = getUnit('11')!;
    const entry = unit.entries.find((e) => {
      const gen = generateClozeForEntry(e.entryId);
      return gen.some((g) => g.difficulty === 'easy');
    })!;
    expect(entry).toBeDefined();

    saveSession({
      unit: '11',
      entryIds: [entry.entryId],
      type: 'cloze',
      batchSize: 1,
      difficulty: 'easy',
    });

    const { root } = await renderPractice();
    const option = document.querySelector(
      '.option-grid .option-btn',
    ) as HTMLButtonElement;
    await act(async () => {
      option.click();
    });
    return { root };
  }

  it('shows the report button in cloze feedback and opens the dialog', async () => {
    await answerOneCloze();

    const reportBtn = document.querySelector(
      '.report-btn',
    ) as HTMLButtonElement;
    expect(reportBtn).toBeTruthy();

    await act(async () => {
      reportBtn.click();
    });

    const dialog = document.querySelector('.report-modal');
    expect(dialog).toBeTruthy();
    const radios = document.querySelectorAll(
      '.report-options input[type="radio"]',
    );
    // 四個選項 + 其他
    expect(radios.length).toBe(5);
  });

  it('submits the report with auto-filled locator and chosen option', async () => {
    await answerOneCloze();

    await act(async () => {
      (document.querySelector('.report-btn') as HTMLButtonElement).click();
    });

    // 勾第一個選項
    const firstRadio = document.querySelector(
      '.report-options input[type="radio"]',
    ) as HTMLInputElement;
    await act(async () => {
      firstRadio.click();
    });

    await act(async () => {
      (
        Array.from(document.querySelectorAll('.report-modal .btn')).find(
          (b) => b.textContent === '送出',
        ) as HTMLButtonElement
      ).click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(`/e/${FORM_CONFIG.formId}/formResponse`);
    expect(init.method).toBe('POST');
    expect(init.mode).toBe('no-cors');

    const body = new URLSearchParams(init.body as string);
    expect(body.get(FORM_CONFIG.entries.locator)).toMatch(/^u11 · \w+ · /);
    expect(body.get(FORM_CONFIG.entries.word)).toBeTruthy();
    expect(body.get(FORM_CONFIG.entries.question)).toContain('選項：');
    // 自訂值（實際單字）要走 Google Form 的「其他」欄位語法
    expect(body.get(FORM_CONFIG.entries.problemOption)).toBe(
      '__other_option__',
    );
    expect(
      body.get(`${FORM_CONFIG.entries.problemOption}.other_option_response`),
    ).toBe(firstRadio.value);
    // 送出成功訊息
    expect(document.querySelector('.report-sent')).toBeTruthy();
  });

  it('keeps the dialog open with an error note when fetch fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    await answerOneCloze();

    await act(async () => {
      (document.querySelector('.report-btn') as HTMLButtonElement).click();
    });
    await act(async () => {
      (
        document.querySelector(
          '.report-options input[type="radio"]',
        ) as HTMLInputElement
      ).click();
    });
    await act(async () => {
      (
        Array.from(document.querySelectorAll('.report-modal .btn')).find(
          (b) => b.textContent === '送出',
        ) as HTMLButtonElement
      ).click();
    });

    expect(document.querySelector('.report-error')).toBeTruthy();
    // 對話框還開著，可以再試
    expect(document.querySelector('.report-modal')).toBeTruthy();
  });
});