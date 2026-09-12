// @vitest-environment jsdom
/**
 * 跨 Unit 一鍵複習 session（unit: MULTI_UNIT）的 PracticeScreen 回歸：
 * 跨 Unit 的 entryIds 不被逐 Unit 查找丟棄、batchSize 切批生效、
 * 標題不出現「Unit multi」（顯示「計畫複習」）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PracticeScreen } from '../src/screens/PracticeScreen.js';
import { saveSession, MULTI_UNIT } from '../src/session.js';
import { resetProgress } from '../src/progressStore.js';
import { getUnit, getEntry } from '../src/lib/data.js';
import { clearCheckpoint } from '../src/lib/checkpoint.js';

describe('PracticeScreen cross-Unit multi session', () => {
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

  it('renders batchSize questions across two units; title is 計畫複習', async () => {
    // 跨兩個 Unit 的 entryIds，entryIds 數 > batchSize（切片生效）。
    const u11 = getUnit('11')!.entries.slice(0, 3).map((e) => e.entryId);
    const u12 = getUnit('12')!.entries.slice(0, 3).map((e) => e.entryId);
    const all = [...u11, ...u12];
    // 確認跨 Unit（單一 Unit 測試無法抓到「逐 Unit 查找丟字」回歸）。
    expect(new Set(all.map((id) => getEntry(id)!.entryId)).size).toBe(6);

    saveSession({
      unit: MULTI_UNIT,
      entryIds: all,
      type: 'flashcard',
      batchSize: 4,
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

    // 跨 Unit id 全部解析成功，且依 batchSize 切出本批。
    const meta = document.querySelector('.qmeta span')?.textContent ?? '';
    expect(meta).toContain('1 / 4');
    // 標題是「計畫複習」，不是「Unit multi」。
    const title = document.querySelector('h1')?.textContent ?? '';
    expect(title).toBe('計畫複習');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('no plan context: mixed session still renders cross-unit ids', async () => {
    const u11 = getUnit('11')!.entries.slice(0, 2).map((e) => e.entryId);
    const u12 = getUnit('12')!.entries.slice(0, 2).map((e) => e.entryId);
    saveSession({
      unit: MULTI_UNIT,
      entryIds: [...u11, ...u12],
      type: 'flashcard',
      batchSize: 4,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<PracticeScreen navigate={() => {}} />);
    });
    const meta = document.querySelector('.qmeta span')?.textContent ?? '';
    expect(meta).toContain('1 / 4');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});