// 稽核 staging 的 units-<n>.json，標準與 tests/unit11ClozeData.test.ts + validate-data 一致。
// 用法：node scripts/audit-staging.mjs <unit號...>
// 例如批 1：node scripts/audit-staging.mjs 19 20 21 22 23 24 25 26 27 28 29 30 31 32
// 兩輪式：先註冊所有檔案（含 11/12）的 pos 再驗證，避免同檔後位 entry 誤報。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const unitArgs = process.argv.slice(2).map(Number);
if (!unitArgs.length) {
  console.error('用法: node scripts/audit-staging.mjs <unit號...>');
  process.exit(2);
}

const vocab = JSON.parse(readFileSync(resolve(ROOT, 'src/data/vocab.json'), 'utf8'));
const vocabMap = new Map(vocab.units.flatMap((u) => u.entries.map((e) => [e.entryId, e])));

// 第一輪：讀入所有檔案，註冊每個 entry 的 pos（staging 指定單位 + 已合併的 11/12）
const posMap = new Map();
const stagingData = new Map();
for (const f of ['units-11.json', 'units-12.json']) {
  const d = JSON.parse(readFileSync(resolve(ROOT, 'src/data/enrichment', f), 'utf8'));
  for (const e of d.entries) posMap.set(e.entryId, e.pos);
}
for (const n of unitArgs) {
  const path = resolve(ROOT, `src/data/enrichment/.staging/units-${n}.json`);
  let d;
  try {
    d = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`units-${n}.json: JSON parse failed: ${e.message}`);
    process.exit(1);
  }
  stagingData.set(n, d);
  for (const e of d.entries) posMap.set(e.entryId, e.pos);
}

const errors = [];
let totalEntries = 0;
let totalQuestions = 0;
const norm = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();

// 第二輪：驗證
for (const n of unitArgs) {
  const data = stagingData.get(n);
  const label = (s) => `U${n} ${s}`;
  if (data.schemaVersion !== 1) errors.push(label('schemaVersion != 1'));
  if (data.unit !== String(n)) errors.push(label(`unit=${data.unit}`));

  const expected = vocab.units.find((u) => u.unit === String(n))?.entries ?? [];
  const gotIds = data.entries.map((e) => e.entryId);
  for (const exp of expected) {
    if (!gotIds.includes(exp.entryId)) errors.push(label(`missing ${exp.entryId}`));
  }
  for (const id of gotIds) {
    if (gotIds.indexOf(id) !== gotIds.lastIndexOf(id)) errors.push(label(`duplicate entryId ${id}`));
  }

  const pools = new Map();
  const allStems = new Map();

  for (const e of data.entries) {
    totalEntries++;
    const word = vocabMap.get(e.entryId)?.word;
    if (!word) errors.push(label(`${e.entryId} not in vocab`));
    if (!e.zh || !e.pos) errors.push(label(`${e.entryId} missing zh/pos`));
    if (!['noun', 'verb', 'adjective', 'adverb', 'phrase'].includes(e.pos))
      errors.push(label(`${e.entryId} bad pos ${e.pos}`));
    if (!e.example || !e.exampleZh) errors.push(label(`${e.entryId} missing example`));
    // spellingHint 慣例：字母 - 連字、片語字間空格、全小寫（a.m. → a-m）
    if (!/^[a-z- ]+$/.test(e.spellingHint) || /(^|[ -])-|-( |$)/.test(e.spellingHint))
      errors.push(label(`${e.entryId} bad spellingHint "${e.spellingHint}"`));
    if (e.status !== 'reviewed' || e.source !== '人工編寫')
      errors.push(label(`${e.entryId} status/source wrong`));

    if (!Array.isArray(e.clozeEasy) || e.clozeEasy.length !== 2)
      errors.push(label(`${e.entryId} clozeEasy != 2`));
    if (!Array.isArray(e.clozeMedium) || e.clozeMedium.length !== 2)
      errors.push(label(`${e.entryId} clozeMedium != 2`));
    if (!e.clozeHard) errors.push(label(`${e.entryId} missing clozeHard`));
    if (errors.length > 200) break;

    const qs = [
      ['cloze', e.cloze],
      ...e.clozeEasy.map((q) => ['easy', q]),
      ...e.clozeMedium.map((q) => ['medium', q]),
      ['hard', e.clozeHard],
    ];
    const stems = new Set();
    for (const [tier, q] of qs) {
      totalQuestions++;
      const tag = `${e.entryId} ${tier}`;
      if (!q.sentence || q.sentence.split('___').length - 1 !== 1) {
        errors.push(label(`${tag} blank count`));
        continue;
      }
      if (q.fullSentence !== q.sentence.replace('___', word))
        errors.push(label(`${tag} fullSentence mismatch`));
      if (!q.translation || !q.clue) errors.push(label(`${tag} missing translation/clue`));
      if (q.answerEntryId !== e.entryId) errors.push(label(`${tag} answerEntryId wrong`));
      const ids = [q.answerEntryId, ...q.distractorEntryIds];
      if (ids.length !== 4 || new Set(ids).size !== 4) {
        errors.push(label(`${tag} options not 4 unique`));
        continue;
      }
      const labels = ids.map((id) => vocabMap.get(id)?.word);
      if (labels.some((w) => !w)) {
        errors.push(label(`${tag} distractor not in vocab: ${ids.join(',')}`));
        continue;
      }
      if (new Set(labels.map((w) => norm(w))).size !== 4)
        errors.push(label(`${tag} duplicate word labels`));
      if (tier !== 'easy') {
        for (const id of q.distractorEntryIds) {
          if (posMap.get(id) !== e.pos)
            errors.push(label(`${tag} pos mismatch: ${id} (${posMap.get(id)}) vs ${e.pos}`));
        }
      }
      for (const w of labels) {
        const re = new RegExp(`(?:^|[^A-Za-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^A-Za-z])`, 'i');
        if (re.test(q.sentence)) errors.push(label(`${tag} stem contains option "${w}"`));
      }
      const nstem = norm(q.sentence);
      if (stems.has(nstem)) errors.push(label(`${tag} duplicate stem within entry`));
      stems.add(nstem);
      if (allStems.has(nstem))
        errors.push(label(`cross-entry duplicate stem: ${tag} == ${allStems.get(nstem)}`));
      allStems.set(nstem, tag);
      const poolKey = `${tier}:${[...q.distractorEntryIds].sort().join('|')}`;
      pools.set(poolKey, (pools.get(poolKey) ?? 0) + 1);
    }
    if (e.cloze.fullSentence === e.example) errors.push(label(`${e.entryId} cloze = example`));
  }

  for (const [key, count] of pools) {
    if (count > 6) errors.push(label(`pool reuse ${count} > 6: ${key.slice(0, 60)}`));
  }
}

console.log(`units: [${unitArgs.join(',')}]  entries: ${totalEntries}  questions: ${totalQuestions}`);
if (errors.length) {
  console.log(`ERRORS (${errors.length}):`);
  for (const e of errors.slice(0, 60)) console.log('  ' + e);
  if (errors.length > 60) console.log(`  ...and ${errors.length - 60} more`);
  process.exit(1);
} else {
  console.log('ALL CHECKS PASSED');
}