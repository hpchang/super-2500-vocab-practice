import type { POS, ClozeQuestion } from '@/types/index';
import { getEnrichedEntry, getUnits } from './data';

/**
 * Difficulty levels for cloze questions.
 * - easy:   cross-POS distractors (e.g. noun vs verb — easy to rule out)
 * - medium: same-POS distractors (must use meaning to choose)
 * - hard:   same-POS + semantically near distractors (e.g. apartment/house/room)
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '簡易',
  medium: '中等',
  hard: '艱難',
};

/** Per-POS count of questions. 5 total: 2 easy + 2 medium + 1 hard. */
export const QUESTIONS_PER_WORD = 5;
export const DIFFICULTY_COUNTS: Record<Difficulty, number> = {
  easy: 2,
  medium: 2,
  hard: 1,
};

// ── Fixed sentence templates per POS ──────────────────────────────
// The blank "___" is placed where the word goes. These are intentionally
// simple, junior-high-level frames so generated sentences are always
// grammatical. The hard question reuses the human-authored example.

interface Template {
  pattern: string; // sentence with "___"
  build: (word: string) => string; // full sentence
}

const TEMPLATES: Record<POS, Template[]> = {
  noun: [
    {
      pattern: 'I see a ___ over there.',
      build: (w) => `I see a ${w} over there.`,
    },
    {
      pattern: 'There is a ___ on the table.',
      build: (w) => `There is a ${w} on the table.`,
    },
  ],
  verb: [
    {
      pattern: 'Please ___ carefully.',
      build: (w) => `Please ${w} carefully.`,
    },
    {
      pattern: 'They will ___ tomorrow.',
      build: (w) => `They will ${w} tomorrow.`,
    },
  ],
  adjective: [
    {
      pattern: 'This is very ___.',
      build: (w) => `This is very ${w}.`,
    },
    {
      pattern: 'The weather is ___.',
      build: (w) => `The weather is ${w}.`,
    },
  ],
  adverb: [
    {
      pattern: 'Please go ___.',
      build: (w) => `Please go ${w}.`,
    },
    {
      pattern: 'He walked ___.',
      build: (w) => `He walked ${w}.`,
    },
  ],
  phrase: [
    {
      pattern: 'I need the ___.',
      build: (w) => `I need the ${w}.`,
    },
    {
      pattern: 'Look at the ___.',
      build: (w) => `Look at the ${w}.`,
    },
  ],
};

// ── Distractor pools ───────────────────────────────────────────────

interface EntryInfo {
  entryId: string;
  word: string;
  zh: string;
  pos: POS;
}

/** Collect all enriched entries across all units for distractor pools. */
const ALL_ENRICHED: EntryInfo[] = (() => {
  const out: EntryInfo[] = [];
  for (const unit of getUnits()) {
    for (const entry of unit.entries) {
      const e = getEnrichedEntry(entry.entryId);
      if (e) {
        out.push({
          entryId: entry.entryId,
          word: entry.word,
          zh: e.zh,
          pos: e.pos,
        });
      }
    }
  }
  return out;
})();

function samePos(exclude: string, pos: POS): EntryInfo[] {
  return ALL_ENRICHED.filter((e) => e.entryId !== exclude && e.pos === pos);
}

function diffPos(exclude: string, pos: POS): EntryInfo[] {
  return ALL_ENRICHED.filter((e) => e.entryId !== exclude && e.pos !== pos);
}

// ── Semantic similarity via Chinese gloss overlap ──────────────────

/** Tokenize a Chinese gloss into bigrams + single chars for overlap. */
function zhTokens(zh: string): Set<string> {
  const tokens = new Set<string>();
  // Individual characters (non-trivial)
  for (const ch of zh) {
    if (ch.trim()) tokens.add(ch);
  }
  // Bigrams
  for (let i = 0; i < zh.length - 1; i++) {
    tokens.add(zh.slice(i, i + 2));
  }
  return tokens;
}

/** Similarity = Jaccard overlap of Chinese gloss tokens. */
function semanticSimilarity(zhA: string, zhB: string): number {
  const a = zhTokens(zhA);
  const b = zhTokens(zhB);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Pick same-POS distractors that are semantically close to the answer. */
function semanticallyNearDistractors(
  answer: EntryInfo,
  count: number,
): EntryInfo[] {
  const candidates = samePos(answer.entryId, answer.pos);
  const scored = candidates
    .map((c) => ({ info: c, score: semanticSimilarity(answer.zh, c.zh) }))
    .filter((s) => s.score > 0) // must share some semantic overlap
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((s) => s.info);
}

// ── Deterministic shuffle (stable per seed) ────────────────────────

function shuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  let s = (seed * 2654435761) >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pick3<T>(arr: T[], seed: number): T[] {
  if (arr.length <= 3) return arr;
  return shuffle(arr, seed).slice(0, 3);
}

// ── Cloze question generation ──────────────────────────────────────

export interface GeneratedCloze {
  difficulty: Difficulty;
  /** Index within that difficulty (0-based). */
  variant: number;
  cloze: ClozeQuestion;
}

/**
 * Generate 5 cloze questions for a single enriched entry:
 * 2 easy + 2 medium + 1 hard.
 *
 * - easy: template sentence, cross-POS distractors
 * - medium: template sentence, same-POS distractors
 * - hard: human example sentence, same-POS + semantically near distractors
 */
export function generateClozeForEntry(entryId: string): GeneratedCloze[] {
  const enriched = getEnrichedEntry(entryId);
  if (!enriched) return [];

  const word = getWord(entryId);
  if (!word) return [];

  const pos = enriched.pos;
  const answerInfo: EntryInfo = {
    entryId,
    word,
    zh: enriched.zh,
    pos,
  };

  const out: GeneratedCloze[] = [];

  // ── Easy: 2 variants, cross-POS distractors ──
  const easyDistractorPool = diffPos(entryId, pos);
  const easyTemplates = TEMPLATES[pos];
  for (let v = 0; v < DIFFICULTY_COUNTS.easy; v++) {
    const tpl = easyTemplates[v % easyTemplates.length];
    const distractors = pick3(easyDistractorPool, seedFor(entryId, 'easy', v));
    out.push({
      difficulty: 'easy',
      variant: v,
      cloze: buildCloze(entryId, tpl, word, enriched.zh, distractors),
    });
  }

  // ── Medium: 2 variants, same-POS distractors ──
  const mediumDistractorPool = samePos(entryId, pos);
  for (let v = 0; v < DIFFICULTY_COUNTS.medium; v++) {
    const tpl = easyTemplates[(v + 1) % easyTemplates.length];
    // Use a different distractor subset for the second medium variant
    const distractors = pick3(mediumDistractorPool, seedFor(entryId, 'medium', v));
    out.push({
      difficulty: 'medium',
      variant: v,
      cloze: buildCloze(entryId, tpl, word, enriched.zh, distractors),
    });
  }

  // ── Hard: 1, human example, semantically near same-POS distractors ──
  const humanCloze = enriched.cloze;
  const hardDistractors = semanticallyNearDistractors(answerInfo, 3);
  if (hardDistractors.length >= 3) {
    out.push({
      difficulty: 'hard',
      variant: 0,
      cloze: {
        sentence: humanCloze.sentence,
        fullSentence: humanCloze.fullSentence,
        translation: humanCloze.translation,
        clue: humanCloze.clue,
        answerEntryId: entryId,
        distractorEntryIds: hardDistractors.slice(0, 3).map((d) => d.entryId) as [
          string,
          string,
          string,
        ],
      },
    });
  } else {
    // Fallback: if not enough semantically-near distractors, use same-POS.
    const fallback = pick3(mediumDistractorPool, seedFor(entryId, 'hard', 0));
    out.push({
      difficulty: 'hard',
      variant: 0,
      cloze: {
        sentence: humanCloze.sentence,
        fullSentence: humanCloze.fullSentence,
        translation: humanCloze.translation,
        clue: humanCloze.clue,
        answerEntryId: entryId,
        distractorEntryIds: fallback.map((d) => d.entryId) as [
          string,
          string,
          string,
        ],
      },
    });
  }

  return out;
}

function buildCloze(
  entryId: string,
  tpl: Template,
  word: string,
  zh: string,
  distractors: EntryInfo[],
): ClozeQuestion {
  return {
    sentence: tpl.pattern,
    fullSentence: tpl.build(word),
    translation: `請選出符合句意的字（${zh}）`,
    clue: zh,
    answerEntryId: entryId,
    distractorEntryIds: distractors.slice(0, 3).map((d) => d.entryId) as [
      string,
      string,
      string,
    ],
  };
}

function getWord(entryId: string): string | undefined {
  const unit = entryId.split(':')[0].slice(1);
  const u = getUnits().find((x) => x.unit === unit);
  return u?.entries.find((e) => e.entryId === entryId)?.word;
}

function seedFor(entryId: string, diff: string, variant: number): number {
  let h = 0;
  const s = `${entryId}-${diff}-${variant}`;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Flatten all questions for an entry into a difficulty-indexed map. */
export function clozeQuestionsForEntry(
  entryId: string,
): Record<Difficulty, ClozeQuestion[]> {
  const generated = generateClozeForEntry(entryId);
  const result: Record<Difficulty, ClozeQuestion[]> = {
    easy: [],
    medium: [],
    hard: [],
  };
  for (const g of generated) {
    result[g.difficulty].push(g.cloze);
  }
  return result;
}

/** Count variants available at a given difficulty for an entry. */
export function countClozeVariants(entryId: string, diff: Difficulty): number {
  return clozeQuestionsForEntry(entryId)[diff].length;
}