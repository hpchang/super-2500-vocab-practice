// @vitest-environment jsdom
/**
 * P1 review (2026-08-29) regression tests — session/checkpoint isolation.
 *
 * Covers:
 *  - a checkpoint from a DIFFERENT session must not be restored when
 *     PracticeScreen mounts for a new session (stale cross-unit restore)
 *  - WrongAnswersScreen starting a new session clears an unrelated checkpoint
 *  - a session restored from the checkpoint itself when sessionStorage is
 *    empty (the closed-tab case) instead of showing 沒有練習內容
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PracticeScreen } from '../src/screens/PracticeScreen.js';
import { WrongAnswersScreen } from '../src/screens/WrongAnswersScreen.js';
import { saveSession } from '../src/session.js';
import {
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
} from '../src/lib/checkpoint.js';
import { resetProgress, updateEntryProgress } from '../src/progressStore.js';
import { recordAnswer } from '../src/lib/scheduler.js';
import { getUnit } from '../src/lib/data.js';

function Harness({ screen }: { screen: string }) {
  return (
    <div data-testid="root">
      {screen === 'practice' && <PracticeScreen navigate={() => {}} />}
      {screen === 'wrong' && <WrongAnswersScreen navigate={() => {}} />}
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

function plantCheckpoint(unit: string, entryId: string, prompt: string) {
  saveCheckpoint({
    session: {
      unit,
      entryIds: [entryId],
      type: 'flashcard',
      batchSize: 1,
    },
    questions: [
      { entryId, type: 'flashcard', prompt, answer: entryId },
    ],
    index: 0,
    results: [],
    savedAt: Date.now(),
  });
}

describe('P1 session/checkpoint isolation', () => {
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

  it('does not restore a checkpoint that belongs to a different session', async () => {
    // Interrupted Unit 11 checkpoint...
    plantCheckpoint('11', 'u11:x', 'stale question prompt');

    // ...then a legit Unit 12 session this tab.
    const unit = getUnit('12')!;
    const entry = unit.entries[0];
    saveSession({
      unit: '12',
      entryIds: [entry.entryId],
      type: 'flashcard',
      batchSize: 1,
    });

    const { root } = await renderAt('practice');
    // Must present the Unit 12 session, not the stale Unit 11 question.
    expect(getPrompt()).toBe(entry.word);

    await act(async () => {
      root.unmount();
    });
  });

  it('starting a wrong-queue session clears a stale checkpoint', async () => {
    plantCheckpoint('11', 'u11:x', 'stale');
    expect(loadCheckpoint()).not.toBeNull();

    // Plant a wrong entry for unit 12 so the wrong list has a group to click.
    updateEntryProgress('u12:bad', (prev) => recordAnswer(prev, false, 'en2zh', Date.now()));

    const { root } = await renderAt('wrong');
    const btn = document.querySelector(
      '.card .group-practice-btn',
    ) as HTMLButtonElement | null;
    expect(btn, 'unit group practice button should render').not.toBeNull();
    await act(async () => {
      btn!.click();
    });

    expect(loadCheckpoint()).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('resumes from the checkpoint when sessionStorage is gone (closed tab)', async () => {
    const unit = getUnit('11')!;
    const entry = unit.entries.find((e) => e.entryId.startsWith('u11:'))!;
    const second = unit.entries.find((e) => e.entryId !== entry.entryId)!;
    // Checkpoint carries its own session (sessionStorage is empty here, as
    // after closing and reopening the tab).
    saveCheckpoint({
      session: {
        unit: '11',
        entryIds: [entry.entryId, second.entryId],
        type: 'flashcard',
        batchSize: 2,
      },
      questions: [
        {
          entryId: entry.entryId,
          type: 'flashcard',
          prompt: entry.word,
          answer: entry.entryId,
        },
        {
          entryId: second.entryId,
          type: 'flashcard',
          prompt: second.word,
          answer: second.entryId,
        },
      ],
      index: 1,
      results: [{ entryId: entry.entryId, type: 'flashcard', correct: true }],
      savedAt: Date.now(),
    });

    const { root } = await renderAt('practice');
    // The restored session must render — not 沒有練習內容.
    const qmeta = document.querySelector('.qmeta')?.textContent ?? '';
    expect(qmeta).toContain('第 2 / 2 題');
    expect(getPrompt()).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });
});