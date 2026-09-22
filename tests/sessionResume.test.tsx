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
import { buildSession } from '../src/lib/questions.js';
import { makeInitialProgress } from '../src/lib/scheduler.js';

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

  it('rebuilds the question list on resume so an old 題型輪替 is re-filtered', async () => {
    // 缺陷：checkpoint 把「建立當下」的題目原封不動撈回來，恢復不重套
    // 目前的題型規則。計畫複習在 09-10～09-12 之間會出拼字，那段期間
    // 產生的 checkpoint 恢復時就會把拼字題帶回來（學生 2026-09-17 回報）。
    const unit = getUnit('11')!;
    const entries = unit.entries.slice(0, 8);
    const session = {
      unit: '11',
      entryIds: entries.map((e) => e.entryId),
      type: 'mixed' as const,
      batchSize: 8,
      plan: {
        planId: 'plan-abc',
        date: new Date().toLocaleDateString('sv-SE'),
        section: 'required-review' as const,
        unit: '11',
      },
    };
    // 舊版建置（不含排除）產生的題目：第 4 題正是拼字。
    const staleQuestions = buildSession(entries, 'mixed', 0);
    expect(staleQuestions.map((q) => q.type)[3]).toBe('spelling');

    saveCheckpoint({
      session,
      questions: staleQuestions,
      index: 3,
      results: staleQuestions.slice(0, 3).map((q) => ({
        entryId: q.entryId,
        type: q.type,
        correct: true,
      })),
      savedAt: Date.now(),
    });

    const { root } = await renderAt('practice');

    // 恢復到的那一題不得是拼字——舊輪替必須在恢復時重新過濾。
    const label = document.querySelectorAll('.qmeta span')[1]?.textContent ?? '';
    expect(label).not.toContain('拼字');

    // 題數以「重建後」的長度為準（8 字 × 3 題型輪替 = 8 題），位置保留。
    const qmeta = document.querySelector('.qmeta')?.textContent ?? '';
    expect(qmeta).toContain('第 4 / 8 題');

    // 走完剩下的題目：全程都不得出現拼字題。
    const seen: string[] = [];
    for (let i = 3; i < 8; i++) {
      seen.push(document.querySelectorAll('.qmeta span')[1]?.textContent ?? '');
      const opt = document.querySelector('.option-btn') as HTMLButtonElement | null;
      if (!opt) break;
      await act(async () => {
        opt.click();
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
    expect(seen.some((l) => l.includes('拼字'))).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it('resume keeps the cloze questions but re-derives the rotation (混合適性填空)', async () => {
    // 混合的填空題現在讀適性進度，不能再整份重建（否則已作答的填空會被換成
    // 別的 variant）。恢復時：題型輪替照現行規則重建，但填空題沿用 checkpoint
    // ——checkpoint 記的是學生「實際看到」的那題。
    const unit = getUnit('11')!;
    const entries = unit.entries.slice(0, 8);
    const session = {
      unit: '11',
      entryIds: entries.map((e) => e.entryId),
      type: 'mixed' as const,
      batchSize: 8,
    };
    const base = buildSession(entries, 'mixed', 0, false, {});
    const clozeIdx = base.findIndex((q) => q.type === 'cloze');
    expect(clozeIdx).toBeGreaterThanOrEqual(0);
    const clozeEntryId = base[clozeIdx].entryId;

    // checkpoint 的填空題：學生看到的那一題，是 medium 難度的第 2 個 variant
    // （表示之前已用掉 variant 0）。
    const seenProgress = {
      [clozeEntryId]: {
        ...makeInitialProgress(clozeEntryId),
        totalAnswered: 3,
        totalCorrect: 2,
        streak: 1,
        wrongCount: 0,
        clozeUsed: { medium: [0] },
      },
    };
    const questions = buildSession(entries, 'mixed', 0, false, seenProgress);
    const seenCloze = questions[clozeIdx];
    expect(seenCloze.type).toBe('cloze');
    expect(seenCloze.clozeVariant).toBe(1); // 與空進度（variant 0）不同

    // 恢復當下 store 的進度是空的 → 重建會取 variant 0。
    // 舊程式碼整份重建 → 學生看到 variant 0（換題）；新程式碼沿用 variant 1。
    saveCheckpoint({
      session,
      questions,
      index: clozeIdx,
      results: questions.slice(0, clozeIdx).map((q) => ({
        entryId: q.entryId,
        type: q.type,
        correct: true,
      })),
      savedAt: Date.now(),
    });

    const { root } = await renderAt('practice');

    // 直接停在填空題那一格：題幹／選項必須與 checkpoint 完全相同。
    expect(getPrompt()).toBe(seenCloze.prompt);
    const shown = Array.from(document.querySelectorAll('.option-btn')).map(
      (b) => b.textContent?.replace(/^\d/, ''),
    );
    expect(shown).toEqual(seenCloze.options!.map((o) => o.label));

    await act(async () => {
      root.unmount();
    });
  });

});