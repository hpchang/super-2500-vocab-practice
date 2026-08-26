import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { VocabData, EnrichmentData } from '../src/types/index.js';

const ROOT = resolve(import.meta.dirname, '..');

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

  const u11 = data.units.find((u) => u.unit === '11');
  const u12 = data.units.find((u) => u.unit === '12');
  if (!u11) return fail('Unit 11 missing');
  if (!u12) return fail('Unit 12 missing');

  // Expected counts from the workbook.
  if (u11.total !== 123) fail(`Unit 11 total=${u11.total}, expected 123`);
  else ok('Unit 11 total = 123');
  if (u11.importantCount !== 65) fail(`Unit 11 important=${u11.importantCount}, expected 65`);
  else ok('Unit 11 important = 65');
  if (u12.total !== 130) fail(`Unit 12 total=${u12.total}, expected 130`);
  else ok('Unit 12 total = 130');
  if (u12.importantCount !== 76) fail(`Unit 12 important=${u12.importantCount}, expected 76`);
  else ok('Unit 12 important = 76');

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
  const paths = [
    resolve(ROOT, 'src/data/enrichment/units-11.json'),
    resolve(ROOT, 'src/data/enrichment/units-12.json'),
  ];
  for (const p of paths) {
    const raw = readFileSync(p, 'utf8');
    const data = JSON.parse(raw) as EnrichmentData;
    const unit = data.unit;
    const vocab = JSON.parse(readFileSync(resolve(ROOT, 'src/data/vocab.json'), 'utf8')) as VocabData;
    const vunit = vocab.units.find((u) => u.unit === unit);
    if (!vunit) return fail(`enrichment unit ${unit} not in vocab`);

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

      // Cloze validation.
      const c = e.cloze;
      if (!c.sentence.includes('___')) fail(`${e.entryId}: cloze sentence missing blank`);
      if (!c.fullSentence) fail(`${e.entryId}: cloze missing fullSentence`);
      if (!c.translation) fail(`${e.entryId}: cloze missing translation`);
      if (!c.clue) fail(`${e.entryId}: cloze missing clue`);
      if (c.answerEntryId !== e.entryId) fail(`${e.entryId}: cloze answer should be itself`);
      if (c.distractorEntryIds.length !== 3) fail(`${e.entryId}: need 3 distractors`);
      const opts = [c.answerEntryId, ...c.distractorEntryIds];
      if (new Set(opts).size !== 4) fail(`${e.entryId}: options not unique`);

      // Distractors must exist in the same Unit and share POS.
      for (const d of c.distractorEntryIds) {
        const dv = vmap.get(d);
        if (!dv) fail(`${e.entryId}: distractor ${d} not in unit ${unit}`);
        if (dv) {
          const de2 = data.entries.find((x) => x.entryId === d);
          if (de2 && de2.pos !== e.pos) {
            fail(`${e.entryId}: distractor ${d} POS ${de2.pos} != ${e.pos}`);
          }
        }
      }
      // Answer must appear exactly once across options.
      const ansCount = opts.filter((o) => o === c.answerEntryId).length;
      if (ansCount !== 1) fail(`${e.entryId}: answer appears ${ansCount} times`);
    }
    ok(`Unit ${unit}: ${data.entries.length} enriched entries valid`);
    if (data.entries.length < 15 || data.entries.length > 25) {
      warn(`Unit ${unit}: ${data.entries.length} entries (expected ~20)`);
    }
  }
}

validateVocab();
validateEnrichment();

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);