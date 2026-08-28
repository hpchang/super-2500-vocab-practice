// @vitest-environment jsdom
/**
 * Regression test for 待辦 #2 — 「情境填空作答後題目錯位」.
 *
 * Root cause (fixed): PracticeScreen rebuilt the whole question list from a
 * useMemo keyed on progress.entries. Answering a cloze question wrote
 * clozeUsed[difficulty] → progress changed → list rebuilt → the current
 * index was recomputed against the next variant of the SAME word, swapping
 * the presented question (stem, options, clue) mid-answer.
 *
 * Fix: the list is built once and rebuilt only in next() with fresh progress,
 * so the presented question stays locked while answering.
 *
 * This test renders PracticeScreen, answers one easy cloze question, and
 * asserts the stem/options shown before and after answering are identical.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PracticeScreen } from '../src/screens/PracticeScreen.js';
import { saveSession } from '../src/session.js';
import { resetProgress } from '../src/progressStore.js';
import { getUnit } from '../src/lib/data.js';
import { generateClozeForEntry } from '../src/lib/clozeGenerator.js';

/** Minimal test driver that renders PracticeScreen and exposes the DOM. */
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

function getOptions(): string[] {
  return Array.from(document.querySelectorAll('.option-grid .option-btn')).map(
    (b) => b.textContent?.replace(/^\d/, '') ?? '',
  );
}

function clickOption(label: string) {
  const btn = Array.from(
    document.querySelectorAll('.option-grid .option-btn'),
  ).find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
  btn.click();
}

describe('PracticeScreen cloze (待辦 #2 regression)', () => {
  beforeEach(() => {
    resetProgress();
  });

  afterEach(() => {
    resetProgress();
    document.body.innerHTML = '';
  });

  it('keeps the presented question (stem and options) stable after answering', async () => {
    const unit = getUnit('11')!;
    const first = unit.entries.find((e) => {
      const gen = generateClozeForEntry(e.entryId);
      // Entry must have 2 easy variants so the pre-fix bug could show.
      return gen.filter((g) => g.difficulty === 'easy').length >= 2;
    })!;
    expect(first).toBeDefined();

    saveSession({
      unit: '11',
      entryIds: [first.entryId],
      type: 'cloze',
      batchSize: 1,
      difficulty: 'easy',
    });

    const { root } = await renderPractice();

    const promptBefore = getPrompt();
    const optionsBefore = getOptions();
    expect(promptBefore).toBeTruthy();
    expect(optionsBefore.length).toBeGreaterThanOrEqual(3);

    // Answer by clicking the FIRST option (whatever it is).
    await act(async () => {
      clickOption(optionsBefore[0]);
    });

    // Feedback is now visible — assert the presented question did not change.
    const promptAfter = getPrompt();
    const optionsAfter = getOptions();
    expect(promptAfter).toBe(promptBefore);
    expect(optionsAfter).toEqual(optionsBefore);

    // Clicking the feedback area advances (click-to-continue, 下一題 UX):
    // the feedback clears, moving to the next question or the results page
    // (either is correct for a short session).
    await act(async () => {
      (document.querySelector('.feedback') as HTMLElement).click();
    });
    expect(document.querySelector('.feedback')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
