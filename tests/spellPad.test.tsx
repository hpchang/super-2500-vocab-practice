// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { SpellPad } from '../src/components/SpellPad.js';
import { PracticeScreen } from '../src/screens/PracticeScreen.js';
import { buildSpellPad } from '../src/lib/spellKeys.js';
import { getEnrichedEntry, getUnit } from '../src/lib/data.js';
import { loadEnrichments } from '../src/lib/enrichmentRegistry.js';
import { saveSession } from '../src/session.js';
import { resetProgress } from '../src/progressStore.js';

const roots: ReturnType<typeof createRoot>[] = [];

function Harness() {
  const [screen, setScreen] = useState('practice');
  return screen === 'practice'
    ? createElement(PracticeScreen, { navigate: setScreen })
    : createElement('div', { 'data-testid': 'results-screen' });
}

async function renderNode(node: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
  return { container, root };
}

async function renderSpellPad(
  word: string,
  entryId = 'test:spell',
  disabled = false,
  onComplete = vi.fn(),
) {
  const rendered = await renderNode(
    createElement(SpellPad, { entryId, word, disabled, onComplete }),
  );
  return { ...rendered, onComplete };
}

function keyButton(container: HTMLElement, key: string): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>('.spell-key'),
  ).find((candidate) => candidate.textContent === key);
  if (!button) throw new Error(`找不到拼字鍵 ${key}`);
  return button;
}

function activeLetterIndex(container: HTMLElement): number {
  const active = container.querySelector<HTMLButtonElement>(
    '.spell-box[aria-current="true"]',
  );
  if (!active) throw new Error('找不到目前作用中的字母框');
  const match = active.getAttribute('aria-label')?.match(/第 (\d+) 個字母/);
  if (!match) throw new Error('作用中字母框缺少索引');
  return Number(match[1]) - 1;
}

async function fillPracticePad(entryId: string, word: string, wrongFirst = false) {
  const model = buildSpellPad(entryId, word);
  const letterSlots = model.filter((slot) => slot.letterIndex !== null);

  for (let i = 0; i < letterSlots.length; i++) {
    const letterIndex = activeLetterIndex(document.body);
    const slot = model.find((candidate) => candidate.letterIndex === letterIndex);
    if (!slot) throw new Error(`找不到字母槽 ${letterIndex}`);
    const correct = slot.char.toUpperCase();
    const selected = wrongFirst && i === 0
      ? slot.keys.find((key) => key !== correct)!
      : correct;
    await act(async () => {
      keyButton(document.body, selected).click();
    });
  }
}

function getSpellingEntry() {
  const entry = getUnit('11')?.entries.find(
    (candidate) =>
      /^[A-Za-z]+$/.test(candidate.word) &&
      Boolean(getEnrichedEntry(candidate.entryId)),
  );
  if (!entry) throw new Error('Unit 11 沒有可用的純字母拼字題');
  return entry;
}

beforeEach(async () => {
  await loadEnrichments();
  window.sessionStorage.clear();
  window.localStorage.clear();
  resetProgress();
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.innerHTML = '';
  window.sessionStorage.clear();
  window.localStorage.clear();
  resetProgress();
});

describe('SpellPad', () => {
  it('renders letter boxes and static separators for hyphens and parentheses', async () => {
    const { container } = await renderSpellPad('T-shirt');

    // T-shirt has six alphabetic characters; the hyphen is static.
    expect(container.querySelectorAll('.spell-box')).toHaveLength(6);
    expect(container.querySelectorAll('.spell-sep')).toHaveLength(1);
    expect(container.querySelector('.spell-sep')?.textContent).toBe('-');
    expect(container.querySelector('.spell-sep')?.tagName).toBe('SPAN');

    const earring = await renderSpellPad('earring(s)');
    expect(earring.container.querySelectorAll('.spell-box')).toHaveLength(7);
    const staticPart = Array.from(
      earring.container.querySelectorAll('.spell-sep'),
    );
    expect(staticPart.map((part) => part.textContent).join('')).toBe('(s)');
    expect(staticPart.every((part) => part.tagName === 'SPAN')).toBe(true);
    expect(earring.container.querySelectorAll('.spell-sep BUTTON')).toHaveLength(0);
  });

  it('shows eight keys after selecting a box and hides the keypad when disabled', async () => {
    const enabled = await renderSpellPad('apple');
    await act(async () => {
      enabled.container.querySelector<HTMLButtonElement>('.spell-box')!.click();
    });
    expect(enabled.container.querySelectorAll('.spell-keypad .spell-key')).toHaveLength(8);

    const disabled = await renderSpellPad('apple', 'test:disabled', true);
    expect(disabled.container.querySelector('.spell-keypad')).toBeNull();
    expect(disabled.container.querySelector('.spell-pad')?.classList.contains('disabled')).toBe(
      true,
    );
  });

  it('fills a key and automatically advances the active slot', async () => {
    const entryId = 'test:cat';
    const word = 'cat';
    const model = buildSpellPad(entryId, word);
    const { container } = await renderSpellPad(word, entryId);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.spell-box')!.click();
      keyButton(container, model[0].char.toUpperCase()).click();
    });

    const boxes = container.querySelectorAll<HTMLButtonElement>('.spell-box');
    expect(boxes[0].textContent).toBe('C');
    expect(boxes[0].getAttribute('aria-current')).toBeNull();
    expect(boxes[1].getAttribute('aria-current')).toBe('true');
  });

  it('reopens a filled slot and overwrites it with another key', async () => {
    const entryId = 'test:cat-overwrite';
    const word = 'cat';
    const model = buildSpellPad(entryId, word);
    const { container } = await renderSpellPad(word, entryId);

    await act(async () => {
      keyButton(container, model[0].char.toUpperCase()).click();
    });
    const replacement = model[0].keys.find(
      (key) => key !== model[0].char.toUpperCase(),
    )!;
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.spell-box')!.click();
    });
    await act(async () => {
      keyButton(container, replacement).click();
    });

    expect(container.querySelector<HTMLButtonElement>('.spell-box')!.textContent).toBe(
      replacement,
    );
  });

  it('calls onComplete exactly once with the original word for correct keys', async () => {
    const entryId = 'test:AIDS';
    const word = 'AIDS';
    const model = buildSpellPad(entryId, word);
    const onComplete = vi.fn();
    const { container } = await renderSpellPad(word, entryId, false, onComplete);

    for (const slot of model.filter((candidate) => candidate.letterIndex !== null)) {
      await act(async () => {
        keyButton(container, slot.char.toUpperCase()).click();
      });
    }

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(word);
    await act(async () => {
      keyButton(container, model[model.length - 1].char.toUpperCase()).click();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('assembles a wrong key sequence into an answer different from the word', async () => {
    const entryId = 'test:AIDS-wrong';
    const word = 'AIDS';
    const model = buildSpellPad(entryId, word);
    const onComplete = vi.fn();
    const { container } = await renderSpellPad(word, entryId, false, onComplete);

    for (let i = 0; i < model.length; i++) {
      const slot = model[i];
      const selected = i === 0
        ? slot.keys.find((key) => key !== slot.char.toUpperCase())!
        : slot.char.toUpperCase();
      await act(async () => {
        keyButton(container, selected).click();
      });
    }

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).not.toBe(word);
  });
});

describe('PracticeScreen spelling integration', () => {
  it('shows correct feedback after every correct spelling key', async () => {
    const entry = getSpellingEntry();
    saveSession({
      unit: '11',
      entryIds: [entry.entryId],
      type: 'spelling',
      batchSize: 1,
    });
    await renderNode(createElement(Harness));

    await fillPracticePad(entry.entryId, entry.word);

    expect(document.querySelector('.feedback.correct')).not.toBeNull();
  });

  it('shows wrong feedback and the correct answer after a wrong key', async () => {
    const entry = getSpellingEntry();
    saveSession({
      unit: '11',
      entryIds: [entry.entryId],
      type: 'spelling',
      batchSize: 1,
    });
    await renderNode(createElement(Harness));

    await fillPracticePad(entry.entryId, entry.word, true);

    const feedback = document.querySelector('.feedback.wrong');
    expect(feedback).not.toBeNull();
    expect(feedback?.textContent).toContain('正確答案：');
  });
});
