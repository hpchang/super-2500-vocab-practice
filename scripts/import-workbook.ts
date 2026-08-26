import { read, utils } from 'xlsx';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const WORKBOOK = resolve(ROOT, '國中英文超強字彙 Super 2500.xlsx');
const OUT = resolve(ROOT, 'src/data/vocab.json');

const SCHEMA_VERSION = 1;

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
  return {
    unit,
    title: `Unit ${unit}`,
    total: entries.length,
    importantCount: entries.filter((e) => e.important).length,
    entries,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const unitsArg = argv.find((a) => a.startsWith('--units='));
  const unitList = unitsArg
    ? unitsArg.slice('--units='.length).split(',').map((s) => s.trim()).filter(Boolean)
    : ['11', '12']; // PoC: only Unit 11 & 12 by default

  const rows = readRows();
  console.log(`Read ${rows.length} total data rows.`);

  const units = unitList.map((u) => buildUnit(rows, u));

  // Cross-Unit duplicates: kept and reported.
  const byTerm = new Map<string, string[]>();
  for (const u of units) {
    for (const e of u.entries) {
      const arr = byTerm.get(e.termId) ?? [];
      arr.push(u.unit);
      byTerm.set(e.termId, arr);
    }
  }
  const crossUnitDuplicates = [...byTerm.entries()]
    .filter(([, us]) => new Set(us).size > 1)
    .map(([termId, us]) => ({ word: termId, units: [...new Set(us)] }));

  const data = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    units,
    crossUnitDuplicates,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n', 'utf8');

  for (const u of units) {
    console.log(
      `Unit ${u.unit}: ${u.total} words, ${u.importantCount} important.`
    );
  }
  if (crossUnitDuplicates.length) {
    console.log(`Cross-Unit duplicates (kept): ${crossUnitDuplicates.length}`);
    for (const d of crossUnitDuplicates) {
      console.log(`  ${d.word} → Units ${d.units.join(', ')}`);
    }
  } else {
    console.log('No cross-Unit duplicates among selected Units.');
  }
  console.log(`Wrote ${OUT}`);
}

main();