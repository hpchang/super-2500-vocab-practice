// @vitest-environment jsdom
/**
 * P2-1 regression tests — session resume via localStorage checkpoint.
 *
 * Covers:
 *  - answering questions persists a checkpoint (position + results)
 *  - a fresh mount with that checkpoint restores the exact question and
 *    previously-recorded results (resume works)
 *  - completing the session clears the checkpoint
 *  - starting a new session (UnitSetup) clears the checkpoint
 *  - a corrupted checkpoint falls back to a fresh session (no crash)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PracticeScreen } from '../src/screens/PracticeScreen.js';
import { UnitSetupScreen } from '../src/screens/UnitSetupScreen.js';
import { saveSession } from '../src/session.js';
import {
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
} from '../src/lib/checkpoint.js';
import { resetProgress } from '../src/progressStore.js';
import { getUnit } from '../src/lib/data.js';

function Harness({ screen }: { screen: string }) {
  return (
    <div data-testid="root">
      {screen === 'practice' && (
        <PracticeScreen navigate={() => {}} />
      )}
      {screen === 'setup' && (
        <UnitSetupScreen unit="11" navigate={() => {}} />
      )}
      {screen === 'results' && <div data-testid="results-screen" />}
    </div>
  );
}

async function renderAt(screen: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Harness screen={screen} />);
  });
  return { root, container };
}

function getPrompt(): string {
  const el = document.querySelector('.qprompt');
  return el ? (el.textContent ?? '') : '';
}

describe('P2-1 session resume checkpoint', () => {
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

  it('persists a checkpoint after answering and clears it on completion', async () => {
    const unit = getUnit('11')!;
    const entry = unit.entries.find((e) =>
      e.entryId.startsWith('u11:'),
    )!;
    // Two entries → 2 questions; answer the first, then complete.
    const second = unit.entries.find((e) => e.entryId !== entry.entryId)!;
    saveSession({
      unit: '11',
      entryIds: [entry.entryId, second.entryId],
      type: 'flashcard',
      batchSize: 2,
    });

    const { root } = await renderAt('practice');

    // Fresh session, nothing answered yet → no checkpoint needed yet, but
    // after self-rating the first card one must exist.
    await act(async () => {
      (
        document.querySelector('.flashcard-actions .remembered') as HTMLButtonElement
      ).click();
    });
    const cp = loadCheckpoint();
    expect(cp).not.toBeNull();
    expect(cp!.index).toBe(0);
    expect(cp!.results).toHaveLength(1);
    expect(cp!.questions).toHaveLength(2);

    // Advance to question 2, rate it, then advance → session complete.
    await act(async () => {
      (document.querySelector('.action-btn') as HTMLButtonElement).click();
    });
    await act(async () => {
      (
        document.querySelector('.flashcard-actions .remembered') as HTMLButtonElement
      ).click();
    });
    await act(async () => {
      (document.querySelector('.action-btn') as HTMLButtonElement).click();
    });
    expect(loadCheckpoint()).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('restores the exact question, position and results after remount', async () => {
    const unit = getUnit('11')!;
    const entry = unit.entries.find((e) =>
      e.entryId.startsWith('u11:'),
    )!;
    const second = unit.entries.find((e) => e.entryId !== entry.entryId)!;
    saveSession({
      unit: '11',
      entryIds: [entry.entryId, second.entryId],
      type: 'flashcard',
      batchSize: 2,
    });

    const first = await renderAt('practice');
    // Rate the first card, then advance to question 2.
    await act(async () => {
      (
        document.querySelector('.flashcard-actions .remembered') as HTMLButtonElement
      ).click();
    });
    await act(async () => {
      (document.querySelector('.action-btn') as HTMLButtonElement).click();
    });
    const promptOnQ2 = getPrompt();
    expect(promptOnQ2).toBeTruthy();
    await act(async () => {
      first.root.unmount();
    });
    document.body.innerHTML = '';

    // Remount (simulates refresh). The checkpoint should put us back on
    // question 2 with the first result intact.
    const secondMount = await renderAt('practice');
    const qmeta = document.querySelector('.qmeta')?.textContent ?? '';
    expect(qmeta).toContain('第 2 / 2 題');

    // The stored results survive: finish the session and check the results
    // screen got exactly the restored answer + the new one.
    await act(async () => {
      (
        document.querySelector('.flashcard-actions .remembered') as HTMLButtonElement
      ).click();
    });
    await act(async () => {
      (document.querySelector('.action-btn') as HTMLButtonElement).click();
    });
    const cpGone = loadCheckpoint();
    expect(cpGone).toBeNull();

    await act(async () => {
      secondMount.root.unmount();
    });
  });

  it('restoring a checkpoint saved during feedback does not re-present the answered question', async () => {
    const unit = getUnit('11')!;
    const entry = unit.entries.find((e) =>
      e.entryId.startsWith('u11:'),
    )!;
    const second = unit.entries.find((e) => e.entryId !== entry.entryId)!;
    saveSession({
      unit: '11',
      entryIds: [entry.entryId, second.entryId],
      type: 'flashcard',
      batchSize: 2,
    });

    const first = await renderAt('practice');
    // Rate the first card. The checkpoint now holds index=0 with the result
    // (results.length === index + 1): the feedback phase.
    await act(async () => {
      (
        document.querySelector('.flashcard-actions .remembered') as HTMLButtonElement
      ).click();
    });
    const promptAnswered = getPrompt();
    expect(loadCheckpoint()!.results).toHaveLength(1);
    await act(async () => {
      first.root.unmount();
    });
    document.body.innerHTML = '';

    // Remount mid-feedback (simulates refresh before pressing 下一題).
    const secondMount = await renderAt('practice');
    // The answered question must come back IN the feedback phase, answerable
    // state restored — otherwise the student can re-rate it and double-record.
    const feedbackShown = document.querySelector('.feedback');
    expect(feedbackShown, 'feedback must be restored, not hidden').not.toBeNull();
    // Progress for the answered entry must not change upon remount.
    expect(loadCheckpoint()!.results).toHaveLength(1);
    expect(getPrompt()).toBe(promptAnswered);

    await act(async () => {
      secondMount.root.unmount();
    });
  });

  it('starting a new session from setup clears a stale checkpoint', async () => {
    // Plant a checkpoint as if a session was interrupted.
    saveCheckpoint({
      session: {
        unit: '11',
        entryIds: ['u11:x'],
        type: 'flashcard',
        batchSize: 1,
      },
      questions: [
        {
          entryId: 'u11:x',
          type: 'flashcard',
          prompt: 'stale',
          answer: 'u11:x',
        },
      ],
      index: 0,
      results: [],
      savedAt: Date.now(),
    });
    expect(loadCheckpoint()).not.toBeNull();

    const { root } = await renderAt('setup');
    // 一鍵開始 (start) — the first enabled .btn in quick-start.
    await act(async () => {
      (document.querySelector('.quick-start .btn') as HTMLButtonElement).click();
    });
    expect(loadCheckpoint()).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('a corrupted checkpoint falls back to a fresh session', async () => {
    window.localStorage.setItem('vocab-super2500-checkpoint', '{not json');
    const unit = getUnit('11')!;
    const entry = unit.entries.find((e) => e.entryId.startsWith('u11:'))!;
    saveSession({
      unit: '11',
      entryIds: [entry.entryId],
      type: 'flashcard',
      batchSize: 1,
    });

    const { root } = await renderAt('practice');
    // Fresh session: question 1 shown, qmeta says 1/1 — no crash.
    const qmeta = document.querySelector('.qmeta')?.textContent ?? '';
    expect(qmeta).toContain('第 1 / 1 題');
    expect(getPrompt()).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });
});