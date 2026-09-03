import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EnrichmentData } from '../src/types/index.js';
import {
  buildClozeSession,
  buildQuestion,
  buildSession,
} from '../src/lib/questions.js';

const ROOT = resolve(import.meta.dirname, '..');

function loadEnrichment(unit: string): EnrichmentData {
  return JSON.parse(
    readFileSync(resolve(ROOT, `src/data/enrichment/units-${unit}.json`), 'utf8'),
  );
}

// Re-import the module to use the same data module that reads JSON.
// The questions lib imports data via '@/...' alias; for tests we replicate
// minimal entries directly from the enrichment JSON to validate question logic.

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

  it('distributes correct answers across option positions', () => {
    const en = loadEnrichment('11');
    const entries = en.entries.map((e) => getEntry(e.entryId)!).slice(0, 20);
    const sessions = [
      ['en2zh', buildSession(entries, 'en2zh')],
      ['zh2en', buildSession(entries, 'zh2en')],
      ['legacy cloze', buildSession(entries, 'cloze')],
      ['generated cloze', buildClozeSession(entries, 'medium', {})],
    ] as const;

    for (const [name, questions] of sessions) {
      const positions = questions.map((question) =>
        question.options!.findIndex((option) => option.entryId === question.answer),
      );
      const counts = [0, 1, 2, 3].map(
        (position) => positions.filter((value) => value === position).length,
      );

      expect(new Set(positions), name).toEqual(new Set([0, 1, 2, 3]));
      expect(Math.max(...counts), name).toBeLessThanOrEqual(questions.length / 2);
    }
  });

  it('covers all option positions across 5-question batches (smallest supported)', () => {
    const en = loadEnrichment('11');
    const entries = en.entries.map((e) => getEntry(e.entryId)!);
    const types = ['en2zh', 'zh2en', 'cloze'] as const;

    for (const type of types) {
      // 5 is a supported batch size (selection.ts BATCH_SIZES). A short
      // session can legitimately miss a position by chance, but across the
      // whole unit no position may be systematically "never right" — the
      // old LCG put the answer at position 4 for every small batch
      // (P1 review 2026-08-29).
      const positions: number[] = [];
      for (let start = 0; start + 5 <= entries.length; start += 5) {
        const batch = entries.slice(start, start + 5);
        const batchPositions = buildSession(batch, type).map((question) =>
          question.options!.findIndex(
            (option) => option.entryId === question.answer,
          ),
        );
        positions.push(...batchPositions);
      }
      const counts = [0, 1, 2, 3].map(
        (p) => positions.filter((x) => x === p).length,
      );
      // Short batches can miss a position by chance, but across the unit no
      // position may be systematically "never right" (the old LCG put every
      // small-batch answer at position 4), and no position may dominate.
      expect(Math.min(...counts), type).toBeGreaterThan(0);
      expect(Math.max(...counts), type).toBeLessThanOrEqual(positions.length / 2);
    }
  });

  it('does not repeat the same answer-position sequence across units', () => {
    // Seeds must derive from question identity, not the bare index —
    // otherwise every unit repeats the same position pattern and a learner
    // can memorize it (P1 review 2026-08-29).
    const units = ['11', '12', '13', '14'];
    for (const type of ['en2zh', 'zh2en'] as const) {
      const sequences = units.map((unit) => {
        const en = loadEnrichment(unit);
        const entries = en.entries.map((e) => getEntry(e.entryId)!).slice(0, 10);
        return buildSession(entries, type).map((question) =>
          question.options!.findIndex(
            (option) => option.entryId === question.answer,
          ),
        );
      });
      // At most one unit may share unit 11's exact sequence out of 4.
      const same = sequences.filter(
        (seq) => JSON.stringify(seq) === JSON.stringify(sequences[0]),
      ).length;
      expect(same, type).toBeLessThanOrEqual(1);
    }
  });

  it('quiz and option shuffles are stable for the same input batch', () => {
    const en = loadEnrichment('11');
    const entries = en.entries.map((e) => getEntry(e.entryId)!).slice(0, 10);
    const snapshot = () =>
      buildSession(entries, 'zh2en').map((question) => ({
        entryId: question.entryId,
        optionEntryIds: question.options!.map((option) => option.entryId),
      }));

    expect(snapshot()).toEqual(snapshot());
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


  it('a later round of the same batch varies order and type rotation', () => {
    const en = loadEnrichment('11');
    const entries = en.entries.map((e) => getEntry(e.entryId)!).slice(0, 15);
    const round0 = buildSession(entries, 'mixed', 0);
    const round1 = buildSession(entries, 'mixed', 1);
    const round2 = buildSession(entries, 'mixed', 2);

    const orderOf = (qs: ReturnType<typeof buildSession>) =>
      qs.map((q) => `${q.entryId}:${q.type}`);

    // Different rounds produce different sequences (order and/or rotation).
    expect(orderOf(round1)).not.toEqual(orderOf(round0));
    expect(orderOf(round2)).not.toEqual(orderOf(round1));
    // Same round is stable — rebuilding twice gives the identical session.
    expect(orderOf(buildSession(entries, 'mixed', 1))).toEqual(orderOf(round1));
    // Same questions overall: every round still covers each entry once.
    for (const qs of [round0, round1, round2]) {
      expect(new Set(qs.map((q) => q.entryId))).toEqual(
        new Set(entries.map((e) => e.entryId)),
      );
    }
  });

  it('cloze sessions vary order between rounds and stay stable within', () => {
    const en = loadEnrichment('11');
    const entries = en.entries.map((e) => getEntry(e.entryId)!).slice(0, 10);
    const r0 = buildClozeSession(entries, 'medium', {}, 0).map((q) => q.entryId);
    const r1 = buildClozeSession(entries, 'medium', {}, 1).map((q) => q.entryId);
    expect(r1).not.toEqual(r0);
    expect(buildClozeSession(entries, 'medium', {}, 1).map((q) => q.entryId)).toEqual(r1);
  });
});
