import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { VocabData, EnrichmentData } from '../src/types/index.js';

const ROOT = resolve(import.meta.dirname, '..');

function loadVocab(): VocabData {
  return JSON.parse(readFileSync(resolve(ROOT, 'src/data/vocab.json'), 'utf8'));
}

function loadEnrichment(unit: string): EnrichmentData {
  return JSON.parse(
    readFileSync(resolve(ROOT, `src/data/enrichment/units-${unit}.json`), 'utf8'),
  );
}

describe('vocab data', () => {
  it('Unit 11 has 123 words, 65 important', () => {
    const v = loadVocab();
    const u11 = v.units.find((u) => u.unit === '11')!;
    expect(u11.total).toBe(123);
    expect(u11.importantCount).toBe(65);
  });

  it('Unit 12 has 130 words, 76 important', () => {
    const v = loadVocab();
    const u12 = v.units.find((u) => u.unit === '12')!;
    expect(u12.total).toBe(130);
    expect(u12.importantCount).toBe(76);
  });

  it('has no within-Unit duplicate entryIds', () => {
    const v = loadVocab();
    for (const u of v.units) {
      const ids = u.entries.map((e) => e.entryId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('normalizes words: trimmed, single-spaced, NFC', () => {
    const v = loadVocab();
    for (const u of v.units) {
      for (const e of u.entries) {
        expect(e.word).toBe(e.word.trim());
        expect(e.word.includes('  ')).toBe(false);
        expect(e.word).toBe(e.word.normalize('NFC'));
        expect(Number.isInteger(e.page)).toBe(true);
        expect(typeof e.important).toBe('boolean');
      }
    }
  });

  it('every enrichment entryId exists in vocab', () => {
    const v = loadVocab();
    for (const unit of ['11', '12']) {
      const en = loadEnrichment(unit);
      const vunit = v.units.find((u) => u.unit === unit)!;
      const ids = new Set(vunit.entries.map((e) => e.entryId));
      for (const e of en.entries) {
        expect(ids.has(e.entryId)).toBe(true);
      }
    }
  });
});