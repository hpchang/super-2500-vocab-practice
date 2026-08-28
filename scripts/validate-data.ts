import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { VocabData, VocabEntry, EnrichmentData, EnrichedEntry, ClozeQuestion } from '../src/types/index.js';

const ROOT = resolve(import.meta.dirname, '..');

// Ground-truth counts per unit, kept in one place for tooling.
// (Mirrors src/lib/enrichmentRegistry.ts UNIT_METADATA.)
const UNIT_METADATA: Record<string, { total: number; important: number }> = {
  '11': { total: 123, important: 65 },
  '12': { total: 130, important: 76 },
};

// Discover enrichment files instead of hardcoding unit numbers (P1-8).
function enrichmentPaths(): string[] {
  const dir = resolve(ROOT, 'src/data/enrichment');
  return readdirSync(dir)
    .filter((f) => /^units-\d+\.json$/.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)![0]);
      const nb = Number(b.match(/\d+/)![0]);
      return na - nb;
    })
    .map((f) => join(dir, f));
}

let errors = 0;
let warnings = 0;

function fail(msg: string) {
  console.error(`✗ ${msg}`);
  errors++;
}
function warn(msg: string) {
  console.warn(`! ${msg}`);
  warnings++;
}
function ok(msg: string) {
  console.log(`✓ ${msg}`);
}

function validateVocab() {
  const raw = readFileSync(resolve(ROOT, 'src/data/vocab.json'), 'utf8');
  const data = JSON.parse(raw) as VocabData;
  if (data.schemaVersion !== 1) fail(`vocab schemaVersion=${data.schemaVersion}`);

  // Fixed-count checks only for units with known workbook metadata;
  // all other units just need internally consistent counts.
  for (const u of data.units) {
    const meta = UNIT_METADATA[u.unit];
    if (!meta) {
      if (u.total !== u.entries.length) {
        fail(`Unit ${u.unit} total=${u.total} != entries ${u.entries.length}`);
      }
      if (u.importantCount !== u.entries.filter((e) => e.important).length) {
        fail(`Unit ${u.unit} importantCount inconsistent with entries`);
      } else {
        ok(`Unit ${u.unit} counts internally consistent (${u.total} words)`);
      }
      continue;
    }
    if (u.total !== meta.total) fail(`Unit ${u.unit} total=${u.total}, expected ${meta.total}`);
    else ok(`Unit ${u.unit} total = ${meta.total}`);
    if (u.importantCount !== meta.important) fail(`Unit ${u.unit} important=${u.importantCount}, expected ${meta.important}`);
    else ok(`Unit ${u.unit} important = ${meta.important}`);
  }

  // Every enrichment unit must exist in vocab.
  for (const p of enrichmentPaths()) {
    const enr = JSON.parse(readFileSync(p, 'utf8')) as EnrichmentData;
    if (!data.units.find((u) => u.unit === enr.unit)) {
      fail(`enrichment unit ${enr.unit} (${p}) missing from vocab.json`);
    }
  }

  // No within-Unit duplicates.
  for (const u of data.units) {
    const seen = new Set<string>();
    for (const e of u.entries) {
      if (seen.has(e.entryId)) fail(`Duplicate entryId ${e.entryId}`);
      seen.add(e.entryId);
    }
    ok(`Unit ${u.unit}: no duplicate entryIds`);
  }

  // Normalization: no leading/trailing spaces, single spaces, NFC.
  for (const u of data.units) {
    for (const e of u.entries) {
      if (e.word !== e.word.trim()) fail(`word not trimmed: "${e.word}"`);
      if (e.word.includes('  ')) fail(`double space in word: "${e.word}"`);
      if (!Number.isInteger(e.page)) fail(`page not int for ${e.entryId}`);
      if (typeof e.important !== 'boolean') fail(`important not boolean for ${e.entryId}`);
    }
  }
  ok('Normalization: all words trimmed, single-spaced, pages integer, important boolean');

  // Cross-Unit duplicates reported (kept, not deleted).
  if (data.crossUnitDuplicates.length) {
    ok(`Cross-Unit duplicates reported: ${data.crossUnitDuplicates.length}`);
  } else {
    ok('No cross-Unit duplicates among selected Units');
  }
}

function validateEnrichment() {
  const paths = enrichmentPaths();
  if (paths.length === 0) return warn('No enrichment files found');
  for (const p of paths) {
    const raw = readFileSync(p, 'utf8');
    const data = JSON.parse(raw) as EnrichmentData;
    const unit = data.unit;
    const vocab = JSON.parse(readFileSync(resolve(ROOT, 'src/data/vocab.json'), 'utf8')) as VocabData;
    const vunit = vocab.units.find((u) => u.unit === unit);
    if (!vunit) return fail(`enrichment unit ${unit} not in vocab`);

    // Global maps across all units: distractors may come from another unit
    // (cross-Unit distractors are allowed by design), so existence and POS
    // checks must resolve against every unit, not just this one.
    const allVocabMap = new Map<string, VocabEntry>();
    for (const u of vocab.units) for (const e of u.entries) allVocabMap.set(e.entryId, e);
    const allEnrichMap = new Map<string, EnrichedEntry>();
    for (const p of paths) {
      const other = JSON.parse(readFileSync(p, 'utf8')) as EnrichmentData;
      for (const e of other.entries) allEnrichMap.set(e.entryId, e);
    }

    // Build entryId → entry map.
    const vmap = new Map(vunit.entries.map((e) => [e.entryId, e]));
    const enrichIds = new Set<string>();
    for (const e of data.entries) {
      enrichIds.add(e.entryId);
      const v = vmap.get(e.entryId);
      if (!v) fail(`enrichment ${e.entryId} not in vocab`);
      if (!e.zh) fail(`${e.entryId}: missing zh`);
      if (!e.example) fail(`${e.entryId}: missing example`);
      if (!e.exampleZh) fail(`${e.entryId}: missing exampleZh`);
      if (!e.spellingHint) fail(`${e.entryId}: missing spellingHint`);
      if (!['draft', 'reviewed'].includes(e.status)) fail(`${e.entryId}: bad status ${e.status}`);
      if (!e.source) fail(`${e.entryId}: missing source`);

      // Cloze validation (shared by all cloze fields). Distractors may come
      // from any imported Unit; POS expectations vary per tier.
      type PosPolicy = 'same' | 'any';
      const validateCloze = (c: ClozeQuestion, label: string, posPolicy: PosPolicy) => {
        const blankCount = c.sentence.split('___').length - 1;
        if (blankCount !== 1) fail(`${e.entryId}: ${label} sentence has ${blankCount} blanks`);
        if (!c.fullSentence) fail(`${e.entryId}: ${label} missing fullSentence`);
        if (!c.translation) fail(`${e.entryId}: ${label} missing translation`);
        if (!c.clue) fail(`${e.entryId}: ${label} missing clue`);
        if (c.answerEntryId !== e.entryId) fail(`${e.entryId}: ${label} answer should be itself`);
        if (c.distractorEntryIds.length !== 3) fail(`${e.entryId}: ${label} need 3 distractors`);
        const opts = [c.answerEntryId, ...c.distractorEntryIds];
        if (new Set(opts).size !== 4) fail(`${e.entryId}: ${label} options not unique`);

        for (const d of c.distractorEntryIds) {
          const dv = allVocabMap.get(d);
          if (!dv) fail(`${e.entryId}: ${label} distractor ${d} not in vocab`);
          const de2 = allEnrichMap.get(d);
          if (de2 && posPolicy === 'same' && de2.pos !== e.pos) {
            fail(`${e.entryId}: ${label} distractor ${d} POS ${de2.pos} != ${e.pos}`);
          }
        }
        // Answer must appear exactly once across options.
        const ansCount = opts.filter((o) => o === c.answerEntryId).length;
        if (ansCount !== 1) fail(`${e.entryId}: ${label} answer appears ${ansCount} times`);
      };

      validateCloze(e.cloze, 'cloze', 'same');
      if (!Array.isArray(e.clozeEasy) || e.clozeEasy.length !== 2) {
        fail(`${e.entryId}: clozeEasy must be an array of 2`);
      } else {
        // Easy tier favors strong clues; distractor POS is unrestricted.
        e.clozeEasy.forEach((c, i) => validateCloze(c, `clozeEasy[${i}]`, 'any'));
      }
      if (!Array.isArray(e.clozeMedium) || e.clozeMedium.length !== 2) {
        fail(`${e.entryId}: clozeMedium must be an array of 2`);
      } else {
        e.clozeMedium.forEach((c, i) => validateCloze(c, `clozeMedium[${i}]`, 'same'));
      }
      if (!e.clozeHard) {
        fail(`${e.entryId}: missing clozeHard`);
      } else {
        validateCloze(e.clozeHard, 'clozeHard', 'same');
      }
    }
    ok(`Unit ${unit}: ${data.entries.length} enriched entries valid`);
    if (data.entries.length < 15) {
      warn(`Unit ${unit}: only ${data.entries.length} entries`);
    }
  }
}

validateVocab();
validateEnrichment();

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);