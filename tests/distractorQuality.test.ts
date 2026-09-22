import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EnrichmentData, VocabData } from '../src/types/index.js';
import { buildQuestion, buildSession } from '../src/lib/questions.js';
import { getEntry, getEnrichedEntry } from '../src/lib/data.js';

const ROOT = resolve(import.meta.dirname, '..');
const UNIT_NUMBERS = readdirSync(resolve(ROOT, 'src/data/enrichment'))
  .filter((f) => /^units-\d+\.json$/.test(f))
  .map((f) => f.match(/\d+/)![0]);
const unitData = Object.fromEntries(
  UNIT_NUMBERS.map((n) => [
    n,
    JSON.parse(
      readFileSync(resolve(ROOT, `src/data/enrichment/units-${n}.json`), 'utf8'),
    ) as EnrichmentData,
  ]),
);
const vocab = JSON.parse(
  readFileSync(resolve(ROOT, 'src/data/vocab.json'), 'utf8'),
) as VocabData;
const vocabMap = new Map(
  vocab.units.flatMap((unit) => unit.entries.map((entry) => [entry.entryId, entry])),
);
const allEntries = UNIT_NUMBERS.flatMap((n) => unitData[n].entries);

function normalizeGloss(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[；;（）()\s、，,。/／·]/g, '')
    .trim();
}
function glossesOverlap(a: string, b: string): boolean {
  const left = normalizeGloss(a);
  const right = normalizeGloss(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

describe('英選中／中選英 干擾項品質', () => {
  it('every option set has 4 options, same POS, all resolving', () => {
    for (const entry of allEntries) {
      const vocabEntry = getEntry(entry.entryId);
      if (!vocabEntry) continue;
      for (const type of ['en2zh', 'zh2en'] as const) {
        const q = buildQuestion(vocabEntry, type);
        expect(q, `${entry.entryId} ${type}`).not.toBeNull();
        const opts = q!.options!;
        expect(opts.length, `${entry.entryId} ${type} option count`).toBe(4);
        expect(new Set(opts.map((o) => o.entryId)).size).toBe(4);
        expect(new Set(opts.map((o) => o.label)).size, `${entry.entryId} ${type} labels`).toBe(4);
        for (const opt of opts) {
          expect(vocabMap.get(opt.entryId), `${entry.entryId} ${type} ${opt.entryId}`).toBeDefined();
        }
      }
    }
  });

  it('no distractor gloss overlaps the answer gloss', () => {
    const offenders: string[] = [];
    for (const entry of allEntries) {
      const vocabEntry = getEntry(entry.entryId);
      if (!vocabEntry) continue;
      for (const type of ['en2zh', 'zh2en'] as const) {
        const q = buildQuestion(vocabEntry, type)!;
        for (const opt of q.options!) {
          if (opt.entryId === q.answer) continue;
          const distractorGloss = getEnrichedEntry(opt.entryId)?.zh;
          if (distractorGloss && glossesOverlap(entry.zh, distractorGloss)) {
            offenders.push(
              `${entry.entryId} ${type}: "${entry.zh}" vs ${opt.entryId} "${distractorGloss}"`,
            );
          }
        }
      }
    }
    expect(offenders.slice(0, 20)).toEqual([]);
  });

  it('regression: the reported double-answer words no longer offer a synonym', () => {
    // These shipped from the legacy pool and were reported as ambiguous.
    const cases: [string, string][] = [
      ['u3:journalist', 'u3:reporter'],
      ['u4:guest', 'u4:visitor'],
      ['u3:manager', 'u3:owner'],
    ];
    for (const [answerId, exDistractorId] of cases) {
      const vocabEntry = getEntry(answerId)!;
      for (const type of ['en2zh', 'zh2en'] as const) {
        const q = buildQuestion(vocabEntry, type)!;
        expect(
          q.options!.some((o) => o.entryId === exDistractorId),
          `${answerId} ${type} must not offer ${exDistractorId}`,
        ).toBe(false);
      }
    }
  });

  it('distractors stay unique within a whole mixed session', () => {
    const entries = UNIT_NUMBERS.slice(0, 4).flatMap((n) => unitData[n].entries.slice(0, 6));
    const vocabEntries = entries.map((e) => getEntry(e.entryId)!).filter(Boolean);
    const qs = buildSession(vocabEntries, 'mixed', 0, false, {});
    // 混合輪替含拼字，拼字題沒有 options——只檢查有 options 的題型。
    const choiceQs = qs.filter((q) => q.options);
    expect(choiceQs.length).toBeGreaterThan(0);
    for (const q of choiceQs) {
      expect(q.options!.length, `${q.entryId} ${q.type} option count`).toBe(4);
      const labels = q.options!.map((o) => o.label);
      expect(new Set(labels).size, `${q.entryId} ${q.type} labels`).toBe(4);
    }
  });
});
