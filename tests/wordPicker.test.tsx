// @vitest-environment jsdom
/**
 * WordPicker 快捷 chip toggle：點一下勾選整群、再點取消整群；
 * 疊加多個 chip 為聯集；手動取消一字後 chip 顯示未選狀態，再點補成全選。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { WordPicker } from '../src/components/WordPicker.js';
import { getUnit } from '../src/lib/data.js';
import { updateEntryProgress, resetProgress, getSnapshot } from '../src/progressStore.js';
import { recordAnswer } from '../src/lib/scheduler.js';
import type { VocabEntry } from '../src/types/index.js';

/** Test harness: owns the selected set exactly like UnitSetupScreen does,
 *  renders WordPicker, and exposes the selection for assertions. */
function makeHarness(entries: VocabEntry[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  let selected = new Set<string>();
  const render = () => {
    root.render(
      <WordPicker
        entries={entries}
        selected={selected}
        onToggle={() => {}}
        onSelectMany={(ids) => {
          const next = new Set(selected);
          for (const id of ids) next.add(id);
          selected = next;
          render();
        }}
        onDeselectMany={(ids) => {
          const next = new Set(selected);
          for (const id of ids) next.delete(id);
          selected = next;
          render();
        }}
      />,
    );
  };
  return {
    mount: async () => {
      await act(async () => {
        render();
      });
    },
    /** Simulate a manual checkbox toggle on one word (the row's checkbox). */
    toggleRow: async (word: string) => {
      const rows = Array.from(
        document.querySelectorAll<HTMLLabelElement>('.word-row'),
      );
      const row = rows.find((r) => r.textContent?.startsWith(word));
      if (!row) throw new Error(`row ${word} not found`);
      await act(async () => {
        (row.querySelector('input') as HTMLInputElement).click();
      });
      // WordPicker calls onToggle — replicate the caller's Set toggle here
      // since the harness's onToggle is a no-op passthrough.
      const id = entries.find((e) => e.word === word)!.entryId;
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      selected = next;
      render();
    },
    selected: () => selected,
    unmount: () => root.unmount(),
  };
}

function chipByLabel(prefix: string): HTMLButtonElement {
  const chips = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.quick-chip'),
  );
  // Chip label text is 「<label> · <count>」(and 錯題 etc. contain the
  // prefix mid-string when a ✓ marker is present) — match by inclusion.
  const found = chips.find((c) => c.textContent?.includes(prefix));
  if (!found) throw new Error(`chip ${prefix} not found`);
  return found;
}

function clickChip(prefix: string) {
  return act(async () => {
    chipByLabel(prefix).click();
  });
}

describe('WordPicker quick-chip toggle', () => {
  let harness: ReturnType<typeof makeHarness>;

  beforeEach(() => {
    resetProgress();
  });

  afterEach(() => {
    resetProgress();
    document.body.innerHTML = '';
    harness?.unmount();
  });

  function seedWrong(entries: VocabEntry[]) {
    // Mark the first two entries as wrong-queue (錯題 chip's group).
    for (const e of entries.slice(0, 2)) {
      updateEntryProgress(e.entryId, (prev) =>
        recordAnswer(prev, false, 'cloze', Date.now()),
      );
    }
  }

  it('click toggles a group on, click again toggles it off', async () => {
    const unit = getUnit('11')!;
    const entries = unit.entries.slice(0, 10);
    seedWrong(entries);
    harness = makeHarness(entries);
    await harness.mount();

    const progress: ReturnType<typeof getSnapshot> = getSnapshot();
    const wrongIds = entries
      .filter((e) => progress.entries[e.entryId]?.inWrongQueue)
      .map((e) => e.entryId);
    expect(wrongIds.length).toBe(2);

    await clickChip('錯題');
    expect(chipByLabel('錯題').className).toContain('active');
    for (const id of wrongIds) {
      expect(harness.selected().has(id)).toBe(true);
    }

    await clickChip('錯題');
    for (const id of wrongIds) {
      expect(harness.selected().has(id)).toBe(false);
    }
    expect(chipByLabel('錯題').className).not.toContain('active');
  });

  it('two chips compose a union; partial deselection clears chip state', async () => {
    const unit = getUnit('11')!;
    const entries = unit.entries.slice(0, 20);
    seedWrong(entries);
    harness = makeHarness(entries);
    await harness.mount();

    await clickChip('錯題');
    await clickChip('重要字');

    const progress = getSnapshot();
    const wrongIds = entries
      .filter((e) => progress.entries[e.entryId]?.inWrongQueue)
      .map((e) => e.entryId);
    const importantIds = entries
      .filter((e) => e.important)
      .map((e) => e.entryId);
    expect(importantIds.length).toBeGreaterThan(0);
    for (const id of new Set([...wrongIds, ...importantIds])) {
      expect(harness.selected().has(id)).toBe(true);
    }
    expect(chipByLabel('錯題').className).toContain('active');
    expect(chipByLabel('重要字').className).toContain('active');

    // Manually deselect one important word via its row checkbox → the
    // 重要字 chip loses active state (group no longer fully selected).
    const someImportant = entries.find(
      (e) => e.important,
    )!;
    await harness.toggleRow(someImportant.word);
    expect(harness.selected().has(someImportant.entryId)).toBe(false);
    expect(chipByLabel('重要字').className).not.toContain('active');
    // The other chip's group is untouched.
    expect(chipByLabel('錯題').className).toContain('active');
  });
});