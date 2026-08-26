// Versioned normalized vocabulary source data.
export interface VocabEntry {
  /** Stable per-Unit id, e.g. "u11:apartment". Unique within a Unit. */
  entryId: string;
  /** Cross-Unit shared id keyed on the normalized word, e.g. "ask". */
  termId: string;
  /** The English word/phrase as it appears in the workbook, normalized. */
  word: string;
  /** Page number in the workbook (integer). */
  page: number;
  /** Whether the workbook marks this word as important. */
  important: boolean;
  /** Unit number as a string, e.g. "11". */
  unit: string;
}

export interface VocabUnit {
  unit: string;
  /** Human-friendly title, e.g. "Unit 11". */
  title: string;
  total: number;
  importantCount: number;
  entries: VocabEntry[];
}

export interface VocabData {
  schemaVersion: number;
  generatedAt: string;
  units: VocabUnit[];
  /** Words appearing in more than one Unit (kept, not deleted). */
  crossUnitDuplicates: { word: string; units: string[] }[];
}