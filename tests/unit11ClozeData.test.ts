import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  ClozeQuestion,
  EnrichedEntry,
  EnrichmentData,
  VocabData,
} from '../src/types/index.js';
import { buildClozeSession } from '../src/lib/questions.js';
import { getEntry } from '../src/lib/data.js';

const ROOT = resolve(import.meta.dirname, '..');
const unit11 = JSON.parse(
  readFileSync(resolve(ROOT, 'src/data/enrichment/units-11.json'), 'utf8'),
) as EnrichmentData;
const unit12 = JSON.parse(
  readFileSync(resolve(ROOT, 'src/data/enrichment/units-12.json'), 'utf8'),
) as EnrichmentData;
const vocab = JSON.parse(
  readFileSync(resolve(ROOT, 'src/data/vocab.json'), 'utf8'),
) as VocabData;

const vocabMap = new Map(
  vocab.units.flatMap((unit) => unit.entries.map((entry) => [entry.entryId, entry])),
);
const enrichmentMap = new Map(
  [...unit11.entries, ...unit12.entries].map((entry) => [entry.entryId, entry]),
);

interface NamedCloze {
  tier: 'cloze' | 'easy' | 'medium' | 'hard';
  question: ClozeQuestion;
}

function allCloze(entry: EnrichedEntry): NamedCloze[] {
  return [
    { tier: 'cloze', question: entry.cloze },
    ...entry.clozeEasy.map((question) => ({ tier: 'easy' as const, question })),
    ...entry.clozeMedium.map((question) => ({ tier: 'medium' as const, question })),
    { tier: 'hard', question: entry.clozeHard },
  ];
}

function normalizeLabel(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function containsOption(stem: string, option: string): boolean {
  const escaped = option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Za-z])${escaped}(?=$|[^A-Za-z])`, 'i').test(stem);
}

for (const { name, data } of [
  { name: '11', data: unit11 },
  { name: '12', data: unit12 },
]) {
  describe(`Unit ${name} cloze content quality`, () => {
    it(`contains ${data.entries.length} entries and complete cloze records`, () => {
      expect(data.entries.flatMap(allCloze)).toHaveLength(data.entries.length * 6);
      for (const entry of data.entries) {
        expect(entry.clozeEasy).toHaveLength(2);
        expect(entry.clozeMedium).toHaveLength(2);
        expect(entry.clozeHard).toBeDefined();
      }
    });

    it('fills every sentence with the canonical word exactly', () => {
      for (const entry of data.entries) {
        const word = vocabMap.get(entry.entryId)?.word;
        expect(word, `${entry.entryId} vocab word`).toBeDefined();
        for (const { tier, question } of allCloze(entry)) {
          const blankCount = question.sentence.split('___').length - 1;
          expect(blankCount, `${entry.entryId} ${tier} blank count`).toBe(1);
          expect(question.fullSentence, `${entry.entryId} ${tier} full sentence`).toBe(
            question.sentence.replace('___', word!),
          );
          expect(question.fullSentence).not.toContain('___');
          expect(question.answerEntryId).toBe(entry.entryId);
        }
      }
    });

    it('uses four resolving, visibly unique English options', () => {
      for (const entry of data.entries) {
        for (const { tier, question } of allCloze(entry)) {
          const ids = [question.answerEntryId, ...question.distractorEntryIds];
          expect(new Set(ids).size, `${entry.entryId} ${tier} option IDs`).toBe(4);
          const labels = ids.map((id) => vocabMap.get(id)?.word);
          expect(labels.every(Boolean), `${entry.entryId} ${tier} labels resolve`).toBe(true);
          expect(
            new Set(labels.map((label) => normalizeLabel(label!))).size,
            `${entry.entryId} ${tier} visible labels`,
          ).toBe(4);
        }
      }
    });

    it('keeps same-POS distractors for legacy, medium, and hard tiers', () => {
      for (const entry of data.entries) {
        for (const { tier, question } of allCloze(entry)) {
          if (tier === 'easy') continue;
          for (const id of question.distractorEntryIds) {
            expect(enrichmentMap.get(id)?.pos, `${entry.entryId} ${tier} ${id} POS`).toBe(
              entry.pos,
            );
          }
        }
      }
    });

    it('keeps legacy Chinese option labels unique', () => {
      for (const entry of data.entries) {
        const ids = [entry.entryId, ...entry.cloze.distractorEntryIds];
        const labels = ids.map((id) => enrichmentMap.get(id)?.zh);
        expect(labels.every(Boolean), `${entry.entryId} legacy Chinese labels resolve`).toBe(true);
        expect(
          new Set(labels.map((label) => normalizeLabel(label!))).size,
          `${entry.entryId} legacy Chinese labels`,
        ).toBe(4);
      }
    });

    it('does not repeat examples, stems, or option words inside stems', () => {
      const seen = new Map<string, string>();
      for (const entry of data.entries) {
        expect(entry.cloze.fullSentence, `${entry.entryId} legacy differs from example`).not.toBe(
          entry.example,
        );
        for (const { tier, question } of allCloze(entry)) {
          const normalized = normalizeLabel(question.sentence);
          expect(seen.get(normalized), `${entry.entryId} ${tier} duplicate stem`).toBeUndefined();
          seen.set(normalized, `${entry.entryId} ${tier}`);

          const optionWords = [question.answerEntryId, ...question.distractorEntryIds].map(
            (id) => vocabMap.get(id)!.word,
          );
          for (const option of optionWords) {
            expect(
              containsOption(question.sentence, option),
              `${entry.entryId} ${tier} stem contains option "${option}"`,
            ).toBe(false);
          }
        }
      }
    });

    it('limits exact distractor-pool reuse within each tier', () => {
      const pools = new Map<string, string[]>();
      for (const entry of data.entries) {
        for (const { tier, question } of allCloze(entry)) {
          const pool = [...question.distractorEntryIds].sort().join('|');
          const key = `${tier}:${pool}`;
          const targets = pools.get(key) ?? [];
          targets.push(entry.entryId);
          pools.set(key, targets);
        }
      }
      for (const [key, targets] of pools) {
        expect(targets.length, `${key} reused by ${targets.join(', ')}`).toBeLessThanOrEqual(6);
      }
    });

    it.each(['easy', 'medium', 'hard'] as const)(
      `builds resolving %s sessions for every Unit ${name} entry`,
      (difficulty) => {
        const entries = data.entries.map((entry) => getEntry(entry.entryId)!);
        const questions = buildClozeSession(entries, difficulty, {});
        expect(questions).toHaveLength(data.entries.length);
        for (const question of questions) {
          expect(question.clozeDifficulty).toBe(difficulty);
          expect(question.options).toHaveLength(4);
          expect(question.options!.every((option) => getEntry(option.entryId))).toBe(true);
          expect(
            new Set(question.options!.map((option) => normalizeLabel(option.label))).size,
          ).toBe(4);
          expect(
            question.options!.filter((option) => option.entryId === question.answer),
          ).toHaveLength(1);
        }
      },
    );
  });
}
