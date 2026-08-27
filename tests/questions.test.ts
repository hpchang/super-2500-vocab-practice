import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EnrichmentData } from '../src/types/index.js';
import { buildQuestion } from '../src/lib/questions.js';

const ROOT = resolve(import.meta.dirname, '..');

function loadEnrichment(unit: string): EnrichmentData {
  return JSON.parse(
    readFileSync(resolve(ROOT, `src/data/enrichment/units-${unit}.json`), 'utf8'),
  );
}

// Re-import the module to use the same data module that reads JSON.
// The questions lib imports data via '@/...' alias; for tests we replicate
// minimal entries directly from the enrichment JSON to validate question logic.

import { buildSession } from '../src/lib/questions.js';
import { getEnrichedEntry, getEntry } from '../src/lib/data.js';

describe('question construction', () => {
  for (const unit of ['11', '12']) {
    const en = loadEnrichment(unit);

    it(`Unit ${unit}: every cloze has 4 unique options and answer appears once`, () => {
      for (const e of en.entries) {
        const c = e.cloze;
        const opts = [c.answerEntryId, ...c.distractorEntryIds];
        expect(new Set(opts).size).toBe(4);
        const ansCount = opts.filter((o) => o === c.answerEntryId).length;
        expect(ansCount).toBe(1);
      }
    });

    it(`Unit ${unit}: all cloze distractor IDs resolve to enriched entries with same POS`, () => {
      for (const e of en.entries) {
        for (const d of e.cloze.distractorEntryIds) {
          const de = getEnrichedEntry(d);
          expect(de, `distractor ${d} should be enriched`).toBeDefined();
          expect(de!.pos).toBe(e.pos);
        }
      }
    });

    it(`Unit ${unit}: all entry IDs in enrichment resolve via getEntry`, () => {
      for (const e of en.entries) {
        const v = getEntry(e.entryId);
        expect(v, `${e.entryId} should exist in vocab`).toBeDefined();
      }
    });
  }

  it('buildQuestion produces a question with resolving answer for cloze', () => {
    const e = loadEnrichment('11').entries[0];
    const v = getEntry(e.entryId)!;
    const q = buildQuestion(v, 'cloze', 0);
    expect(q).not.toBeNull();
    expect(q!.type).toBe('cloze');
    expect(q!.options!.length).toBe(4);
    const labels = q!.options!.map((o) => o.label);
    expect(new Set(labels).size).toBe(4); // unique labels
  });

  it('cloze options are English words (the sentence is English)', () => {
    const e = loadEnrichment('11').entries[0];
    const v = getEntry(e.entryId)!;
    const q = buildQuestion(v, 'cloze', 0);
    // The correct option must be the English word, not the Chinese gloss.
    const correctOpt = q!.options!.find((o) => o.entryId === q!.answer);
    expect(correctOpt!.label).toBe(v.word);
  });

  it('buildQuestion spelling uses the word as answer and carries pos', () => {
    const e = loadEnrichment('11').entries[0];
    const v = getEntry(e.entryId)!;
    const q = buildQuestion(v, 'spelling', 0);
    expect(q!.answer).toBe(v.word);
    expect(q!.pos).toBe(e.pos);
    expect(q!.spellingAnswer).toBe(v.word);
  });

  it('buildSession mixed produces a question per entry', () => {
    const en = loadEnrichment('11');
    const entries = en.entries.map((e) => getEntry(e.entryId)!).slice(0, 5);
    const qs = buildSession(entries, 'mixed');
    expect(qs.length).toBe(5);
  });

  it('flashcard keeps workbook (alphabetical) order', () => {
    const en = loadEnrichment('11');
    const entries = en.entries.map((e) => getEntry(e.entryId)!).slice(0, 10);
    const qs = buildSession(entries, 'flashcard');
    expect(qs.map((q) => q.entryId)).toEqual(
      entries.map((e) => e.entryId),
    );
  });

  it('quiz types shuffle the question order', () => {
    const en = loadEnrichment('11');
    const entries = en.entries.map((e) => getEntry(e.entryId)!).slice(0, 10);
    const qs = buildSession(entries, 'en2zh');
    const order = qs.map((q) => q.entryId);
    // At least 5 of 10 entries should have moved from their workbook slot.
    const moved = order.filter(
      (id, i) => id !== entries[i].entryId,
    ).length;
    expect(moved).toBeGreaterThan(5);
  });

  it('quiz shuffle is stable for the same input batch', () => {
    const en = loadEnrichment('11');
    const entries = en.entries.map((e) => getEntry(e.entryId)!).slice(0, 10);
    const a = buildSession(entries, 'zh2en').map((q) => q.entryId);
    const b = buildSession(entries, 'zh2en').map((q) => q.entryId);
    expect(a).toEqual(b);
  });

  it('en2zh options contain the correct Chinese gloss', () => {
    const e = loadEnrichment('11').entries[0];
    const v = getEntry(e.entryId)!;
    const q = buildQuestion(v, 'en2zh', 0);
    const correctOpt = q!.options!.find((o) => o.entryId === q!.answer);
    expect(correctOpt!.label).toBe(e.zh);
  });

  it('zh2en options contain the correct English word', () => {
    const e = loadEnrichment('11').entries[0];
    const v = getEntry(e.entryId)!;
    const q = buildQuestion(v, 'zh2en', 0);
    const correctOpt = q!.options!.find((o) => o.entryId === q!.answer);
    expect(correctOpt!.label).toBe(v.word);
  });
});