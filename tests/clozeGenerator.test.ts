import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateClozeForEntry,
  DIFFICULTY_COUNTS,
} from '../src/lib/clozeGenerator.js';
import { getEnrichedEntry } from '../src/lib/data.js';

const ROOT = resolve(import.meta.dirname, '..');

function loadEnrichment(unit: string) {
  return JSON.parse(
    readFileSync(resolve(ROOT, `src/data/enrichment/units-${unit}.json`), 'utf8'),
  );
}

/**
 * The cloze generator assembles hand-authored sentences from the enrichment
 * data: 2 easy + 2 medium + 1 hard per entry. Easy distractors are cross-POS,
 * medium/hard distractors are same-POS. Every question is a human sentence,
 * never a fabricated template.
 */
describe('cloze generator (human example sentences)', () => {
  for (const unit of ['11', '12']) {
    const en = loadEnrichment(unit);

    it(`Unit ${unit}: every entry yields 2 easy + 2 medium + 1 hard human cloze`, () => {
      for (const e of en.entries) {
        const gen = generateClozeForEntry(e.entryId);
        expect(
          gen.length,
          `${e.entryId} should produce ${DIFFICULTY_COUNTS.easy + DIFFICULTY_COUNTS.medium + DIFFICULTY_COUNTS.hard} questions`,
        ).toBe(
          DIFFICULTY_COUNTS.easy + DIFFICULTY_COUNTS.medium + DIFFICULTY_COUNTS.hard,
        );
        const easy = gen.filter((g) => g.difficulty === 'easy');
        const medium = gen.filter((g) => g.difficulty === 'medium');
        const hard = gen.filter((g) => g.difficulty === 'hard');
        expect(easy, `${e.entryId} easy`).toHaveLength(DIFFICULTY_COUNTS.easy);
        expect(medium, `${e.entryId} medium`).toHaveLength(DIFFICULTY_COUNTS.medium);
        expect(hard, `${e.entryId} hard`).toHaveLength(DIFFICULTY_COUNTS.hard);
      }
    });

    it(`Unit ${unit}: options unique; easy distractors cross-POS, medium/hard same-POS`, () => {
      for (const e of en.entries) {
        const gen = generateClozeForEntry(e.entryId);
        for (const g of gen) {
          const opts = [g.cloze.answerEntryId, ...g.cloze.distractorEntryIds];
          expect(new Set(opts).size, `${e.entryId} ${g.difficulty} options`).toBe(4);
          for (const d of g.cloze.distractorEntryIds) {
            const de = getEnrichedEntry(d);
            expect(de, `${e.entryId} distractor ${d}`).toBeDefined();
            if (g.difficulty === 'easy') {
              expect(de!.pos, `${e.entryId} ${d} easy POS`).not.toBe(e.pos);
            } else {
              expect(de!.pos, `${e.entryId} ${d} ${g.difficulty} POS`).toBe(e.pos);
            }
          }
        }
      }
    });

    it(`Unit ${unit}: every sentence has a blank and self-answer`, () => {
      for (const e of en.entries) {
        const gen = generateClozeForEntry(e.entryId);
        for (const g of gen) {
          expect(g.cloze.sentence, `${e.entryId} ${g.difficulty} blank`).toContain('___');
          expect(g.cloze.answerEntryId, `${e.entryId} answer`).toBe(e.entryId);
          expect(g.cloze.fullSentence, `${e.entryId} ${g.difficulty} fill`).not.toContain('___');
        }
      }
    });
  }
});
