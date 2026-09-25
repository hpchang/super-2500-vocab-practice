// @vitest-environment jsdom
/**
 * BackupDialog component test (I-13 UI half): the student must SEE what a
 * file contains before it is merged, and a bad file must be refused with a
 * visible reason rather than silently absorbed.
 *
 * No @testing-library/react in this project — component tests drive the DOM
 * with createRoot + act (same pattern as tests/reportDialog.test.tsx).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { BackupDialog } from '../src/components/BackupDialog.js';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function mount(onClose = () => {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<BackupDialog onClose={onClose} />);
  });
}

/** Feed a file into the input the way a browser would. */
async function chooseFile(text: string, name = 'backup.json') {
  const input = document.querySelector<HTMLInputElement>('#backup-file')!;
  const file = new File([text], name, { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function validFile(entries: Record<string, unknown>) {
  return JSON.stringify({
    format: 'vocab-super2500-backup',
    formatVersion: 1,
    exportedAt: 1758000000000,
    progress: { schemaVersion: 1, entries },
    plan: null,
    history: [],
  });
}

const oneWord = {
  'u11:ankle': {
    entryId: 'u11:ankle',
    stage: 'learning',
    totalAnswered: 3,
    totalCorrect: 2,
    totalWrong: 1,
    streak: 1,
    lastAnsweredAt: 1758000000000,
    nextReviewAt: 1758500000000,
    inWrongQueue: false,
    lastWrongType: null,
    wrongCount: 1,
  },
};

describe('BackupDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('shows a preview of the file before merging', async () => {
    await mount();
    // Nothing previewed until a file is chosen.
    expect(document.querySelector('.backup-summary')).toBeNull();

    await chooseFile(validFile(oneWord));

    const summary = document.querySelector('.backup-summary')!;
    expect(summary.textContent).toContain('1 個字');
    // The confirm button only exists in the preview state.
    const buttons = [...document.querySelectorAll('button')].map(
      (b) => b.textContent,
    );
    expect(buttons).toContain('確認合併');
  });

  it('merges on confirm and reports the result', async () => {
    await mount();
    await chooseFile(validFile(oneWord));

    const confirm = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === '確認合併',
    )!;
    await act(async () => {
      (confirm as HTMLButtonElement).click();
    });

    expect(document.body.textContent).toContain('已合併完成');
    expect(document.body.textContent).toContain('新增 1 個字');
    // The word really landed in storage.
    const saved = JSON.parse(
      window.localStorage.getItem('vocab-super2500-progress') ?? '{}',
    );
    expect(saved.entries['u11:ankle']).toBeDefined();
  });

  it('refuses a file that is not a backup, with a visible reason', async () => {
    await mount();
    await chooseFile('this is not json');

    const alert = document.querySelector('[role="alert"]')!;
    expect(alert.textContent).toMatch(/不是有效的備份檔/);
    // No preview, no merge button — nothing was applied.
    expect(document.querySelector('.backup-summary')).toBeNull();
    expect(window.localStorage.getItem('vocab-super2500-progress')).toBeNull();
  });

  it('refuses an unknown backup version rather than guessing', async () => {
    await mount();
    await chooseFile(
      JSON.stringify({
        format: 'vocab-super2500-backup',
        formatVersion: 99,
        progress: { schemaVersion: 1, entries: {} },
      }),
    );
    expect(document.querySelector('[role="alert"]')!.textContent).toMatch(
      /版本不支援/,
    );
  });

  it('exports a downloadable file', async () => {
    // jsdom has no navigation, so the anchor click would log a not-implemented
    // error; stub it and assert the blob URL was still created.
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    await mount();
    const exportBtn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('匯出進度檔案'),
    )!;
    await act(async () => {
      (exportBtn as HTMLButtonElement).click();
    });
    expect((URL.createObjectURL as any).mock.calls.length).toBeGreaterThan(0);
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    await mount(onClose);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
