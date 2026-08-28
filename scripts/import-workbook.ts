import { read, utils } from 'xlsx';
import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// P1-7: the workbook lives in docs/, not the repo root.
const WORKBOOK = resolve(ROOT, 'docs', '國中英文超強字彙 Super 2500.xlsx');
const OUT = resolve(ROOT, 'src/data/vocab.json');

const SCHEMA_VERSION = 1;

interface VocabData {
  schemaVersion: number;
  generatedAt: string;
  units: unknown[];
  crossUnitDuplicates: unknown[];
}

/** Normalize: NFC + collapse repeated spaces + trim. */
function normalize(s: unknown): string {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

function toInt(v: unknown): number {
  const n = Number(String(v ?? '').replace(/[^0-9-]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toBool(v: unknown): boolean {
  return normalize(v) === '是' || normalize(v) === 'yes' || normalize(v) === 'true';
}

function makeEntryId(unit: string, word: string): string {
  return `u${unit}:${word}`;
}

function makeTermId(word: string): string {
  return normalize(word).toLowerCase();
}

interface RawRow {
  word: string;
  page: number;
  important: boolean;
  unit: string;
}

function readRows(): RawRow[] {
  if (!existsSync(WORKBOOK)) {
    throw new Error(`Workbook not found: ${WORKBOOK}`);
  }
  const buf = readFileSync(WORKBOOK);
  const wb = read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const matrix = utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false });
  // Skip header row (row 0), keep only rows that have a word and a unit.
  const out: RawRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const word = normalize(row[0]);
    const unit = normalize(row[3]);
    if (!word || !unit) continue; // skip blank / formatting-only rows
    out.push({
      word,
      page: toInt(row[1]),
      important: toBool(row[2]),
      unit,
    });
  }
  return out;
}

function buildUnit(rows: RawRow[], unit: string) {
  const unitRows = rows.filter((r) => r.unit === unit);
  const seen = new Set<string>();
  const withinUnitDups: string[] = [];
  const entries = unitRows.map((r) => {
    if (seen.has(r.word)) withinUnitDups.push(r.word);
    seen.add(r.word);
    return {
      entryId: makeEntryId(unit, r.word),
      termId: makeTermId(r.word),
      word: r.word,
      page: r.page,
      important: r.important,
      unit,
    };
  });
  if (withinUnitDups.length) {
    throw new Error(
      `Unit ${unit} has duplicate words (not allowed): ${withinUnitDups.join(', ')}`
    );
  }
  if (entries.length === 0) {
    throw new Error(
      `Unit ${unit} has no rows in the workbook — check the --units value`
    );
  }
  return {
    unit,
    title: `Unit ${unit}`,
    total: entries.length,
    importantCount: entries.filter((e) => e.important).length,
    entries,
  };
}

interface ExistingData extends VocabData {
  units: { unit: string }[];
}

function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--'); // tsx passes a stray '--'
  const unitsArg = argv.find((a) => a.startsWith('--units='));
  const dryRun = argv.includes('--dry-run');
  const fullReplace = argv.includes('--full-replace');
  const unitList = unitsArg
    ? unitsArg.slice('--units='.length).split(',').map((s) => s.trim()).filter(Boolean)
    : null;

  if (!unitList) {
    console.error(
      'Usage: npx tsx scripts/import-workbook.ts --units=1,2,32 [--dry-run] [--full-replace]\n' +
        '  --units is required (explicit is safer than an implicit default).\n' +
        '  Default mode MERGES: existing units in vocab.json are preserved.\n' +
        '  --full-replace rebuilds vocab.json from only the listed units.'
    );
    process.exit(1);
  }

  const rows = readRows();
  console.log(`Read ${rows.length} total data rows from docs/ workbook.`);

  const units = unitList.map((u) => buildUnit(rows, u));

  // Merge mode (default): keep units already in vocab.json unless they are
  // being re-imported now. This prevents `--units=13` from wiping 11/12 (P1-7).
  let existingUnits: { unit: string }[] = [];
  let existingDuplicates: unknown[] = [];
  if (!fullReplace && existsSync(OUT)) {
    const existing = JSON.parse(readFileSync(OUT, 'utf8')) as ExistingData;
    const reimported = new Set(units.map((u) => u.unit));
    existingUnits = existing.units.filter((u) => !reimported.has(u.unit));
    // Keep duplicate records that don't involve re-imported units; they are
    // recomputed for the re-imported ones below.
    const dupRecord = existing.crossUnitDuplicates as { word: string; units: string[] }[];
    const reimportedWords = new Set(
      units.flatMap((u) => (u as unknown as { entries: { termId: string }[] }).entries.map((e) => e.termId)),
    );
    existingDuplicates = dupRecord.filter(
      (d) => !d.units.some((unit) => reimported.has(unit)) && !reimportedWords.has(d.word),
    );
   }

  // Cross-Unit duplicates: kept and reported.
  const byTerm = new Map<string, string[]>();
  const allUnits = [...existingUnits, ...units] as { unit: string; entries: { termId: string }[] }[];
  for (const u of allUnits) {
    for (const e of u.entries) {
      const arr = byTerm.get(e.termId) ?? [];
      arr.push(u.unit);
      byTerm.set(e.termId, arr);
    }
  }
  const crossUnitDuplicates = [
    ...existingDuplicates,
    ...[...byTerm.entries()]
      .filter(([, us]) => new Set(us).size > 1)
      .map(([termId, us]) => ({ word: termId, units: [...new Set(us)] })),
  ];

  const sortedUnits = allUnits.sort((a, b) => Number(a.unit) - Number(b.unit));

  const data: VocabData = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    units: sortedUnits,
    crossUnitDuplicates,
  };

  for (const u of units as unknown as { unit: string; total: number; importantCount: number }[]) {
    console.log(`Unit ${u.unit}: ${u.total} words, ${u.importantCount} important.`);
  }
  console.log(
    `Units in output: ${sortedUnits.map((u) => u.unit).join(', ')} ` +
      `(${fullReplace ? 'full replace' : 'merge mode'})`,
  );
  if (crossUnitDuplicates.length) {
    console.log(`Cross-Unit duplicates (kept): ${crossUnitDuplicates.length}`);
    for (const d of crossUnitDuplicates as { word: string; units: string[] }[]) {
      console.log(`  ${d.word} → Units ${d.units.join(', ')}`);
    }
  } else {
    console.log('No cross-Unit duplicates.');
  }

  if (dryRun) {
    console.log('Dry run — vocab.json NOT written.');
    return;
  }

  // Atomic write: tmp file + rename so a crash can't leave a half-written
  // vocab.json (P1-7).
  mkdirSync(dirname(OUT), { recursive: true });
  const tmp = OUT + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, OUT);
  console.log(`Wrote ${OUT}`);
}

try {
  main();
} catch (err) {
  console.error(`import-workbook failed: ${err instanceof Error ? err.message : err}`);
  if (existsSync(OUT + '.tmp')) rmSync(OUT + '.tmp');
  process.exit(1);
}