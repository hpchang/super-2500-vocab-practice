import type {
  QuestionType,
  VocabEntry,
  EnrichedEntry,
  POS,
  EntryProgress,
} from '@/types/index';
import { getEnrichedEntry, getEntry } from './data';
import { clozeQuestionsForEntry, type Difficulty } from './clozeGenerator';
import { chooseDifficulty, nextQuestionIndex } from './adaptive';

/** Difficulty mode: a fixed level or adaptive. */
export type DifficultyMode = Difficulty | 'adaptive';

export interface Question {
  entryId: string;
  type: QuestionType;
  prompt: string;
  /** For choice questions, the four options (shuffled). */
  options?: { entryId: string; label: string }[];
  /** The correct entryId. */
  answer: string;
  /** Extra context shown after answering (cloze). */
  context?: {
    fullSentence: string;
    translation: string;
    clue: string;
  };
  /** Part of speech (for progressive spelling hints). */
  pos?: POS;
  /** The expected spelling answer (word), for spelling type. */
  spellingAnswer?: string;
  /** Cloze difficulty used for this question (for recording usage). */
  clozeDifficulty?: Difficulty;
  /** Cloze variant index within the difficulty pool (for recording usage). */
  clozeVariant?: number;
}

/**
 * Deterministic shuffle (mulberry32 + Fisher–Yates) — the same seed always
 * produces the same permutation, but the permutation quality does not
 * degrade with small arrays: an LCG's low bits are strongly patterned and
 * made every 4-option answer land on the same position for small batches
 * (fixed 2026-08-29). Seeds come from per-question identity, not the bare
 * index, so position patterns do not repeat across batches and units.
 */
function shuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  let a = seed >>> 0;
  const nextRandom = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Options seed for a question: identity-based so layouts vary per word. */
function optionSeed(entryId: string, type: string, extra = ''): number {
  return hashString(`${entryId}:${type}${extra ? `:${extra}` : ''}`);
}

/** FNV-1a hash of a string, for deriving a stable shuffle seed. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Session order: flashcards stay in workbook (alphabetical) order for
 * browsing; quiz types are shuffled so students cannot memorize positions.
 * The shuffle is seeded by the entryIds + round so it stays stable across
 * re-renders (PracticeScreen rebuilds questions whenever progress updates)
 * but varies between rounds of the same batch — otherwise a student repeating
 * a batch would see the identical sequence every time.
 */
function sessionOrder(
  entries: VocabEntry[],
  type: QuestionType | 'mixed',
  round = 0,
): VocabEntry[] {
  if (type === 'flashcard') return entries;
  const seed = hashString(
    `${entries.map((e) => e.entryId).join(',')}#${round}`,
  );
  return shuffle(entries, seed);
}

export function buildQuestion(
  entry: VocabEntry,
  type: QuestionType,
  progress: Record<string, EntryProgress> = {},
): Question | null {
  const enriched = getEnrichedEntry(entry.entryId);
  if (!enriched) return null;

  switch (type) {
    case 'flashcard':
      return {
        entryId: entry.entryId,
        type,
        prompt: entry.word,
        answer: entry.entryId,
        context: {
          fullSentence: enriched.example,
          translation: enriched.exampleZh,
          clue: enriched.zh,
        },
      };

    case 'en2zh': {
      const distractors = pickDistractorZh(entry, enriched);
      const options = shuffle(
        [{ entryId: entry.entryId, label: enriched.zh }, ...distractors],
        optionSeed(entry.entryId, type),
      );
      return {
        entryId: entry.entryId,
        type,
        prompt: entry.word,
        options,
        answer: entry.entryId,
      };
    }

    case 'zh2en': {
      const distractors = pickDistractorWords(entry, enriched);
      const options = shuffle(
        [{ entryId: entry.entryId, label: entry.word }, ...distractors],
        optionSeed(entry.entryId, type),
      );
      return {
        entryId: entry.entryId,
        type,
        prompt: enriched.zh,
        options,
        answer: entry.entryId,
      };
    }

    case 'cloze': {
      // 填空題只從適性題庫（clozeEasy/clozeMedium/clozeHard）出題，與「情境
      // 填空」題型共用同一份適性進度。legacy `enriched.cloze` 已於 2026-09
      // 移除（英選中／中選英的干擾項也改由適性題庫衍生，見 pickDistractors）。
      return buildAdaptiveCloze(entry, 'adaptive', progress);
    }

    case 'spelling':
      return {
        entryId: entry.entryId,
        type,
        prompt: enriched.zh,
        answer: entry.word,
        pos: enriched.pos,
        spellingAnswer: entry.word,
        context: {
          fullSentence: enriched.example,
          translation: enriched.exampleZh,
          clue: enriched.example,
        },
      };

    default:
      return null;
  }
}

/** Normalize a Chinese gloss for overlap comparison. */
function normalizeGloss(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[；;（）()\s、，,。/／·]/g, '')
    .trim();
}

function normalizeWord(value: string): string {
  return value.normalize('NFC').trim().toLowerCase();
}

/**
 * Word pairs that Chinese learners read as the same thing, so a choice
 * question must never offer both. Containment below catches pairs whose
 * glosses share a substring (`journalist`/`reporter`); these do not, but
 * students still pick either one — `guest`/`visitor` and `manager`/`owner`
 * came back as reported ambiguities (2026-09).
 */
const SYNONYM_PAIRS: [string, string][] = [
  ['guest', 'visitor'],
  ['manager', 'owner'],
  ['nephew', 'son'],
  ['aircraft', 'helicopter'],
  ['employ', 'hire'],
  ['journalist', 'reporter'],
  ['lawful', 'legal'],
];

const SYNONYM_KEYS = new Set(
  SYNONYM_PAIRS.map(([a, b]) => [normalizeWord(a), normalizeWord(b)].sort().join('|')),
);

function isKnownSynonym(a: string, b: string): boolean {
  return SYNONYM_KEYS.has(
    [normalizeWord(a), normalizeWord(b)].sort().join('|'),
  );
}

/**
 * Would a student read these two as the same answer? Used to keep a
 * distractor out of a choice question: 英選中／中選英 show the answer's gloss
 * as the prompt, so a distractor that overlaps it makes two options correct.
 * Containment, not equality, because tiers gloss one sense at different
 * lengths (`僱用；聘用` vs `聘請（臨時或特定工作）`).
 */
function glossesOverlap(a: string, b: string): boolean {
  const left = normalizeGloss(a);
  const right = normalizeGloss(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

/** True when two entries would be read as the same answer in a choice set. */
function conflictsAsOptions(a: EnrichedEntry, b: EnrichedEntry): boolean {
  if (glossesOverlap(a.zh, b.zh)) return true;
  const wordA = getEntry(a.entryId)?.word;
  const wordB = getEntry(b.entryId)?.word;
  return Boolean(wordA && wordB && isKnownSynonym(wordA, wordB));
}

/**
 * Candidate distractor entryIds for a word, drawn from its own adaptive cloze
 * pool (clozeEasy/clozeMedium/clozeHard). Those distractors are the curated
 * ones: every one was hand-authored to be ruled out by its own cloze sentence,
 * which makes them far sounder than the legacy `enriched.cloze` pool they
 * replace (2026-09: that pool produced synonym double-answers and giveaways).
 */
function clozePoolCandidates(enriched: EnrichedEntry): string[] {
  const ids = new Set<string>();
  for (const question of [
    ...enriched.clozeEasy,
    ...enriched.clozeMedium,
    enriched.clozeHard,
  ]) {
    if (!question) continue;
    for (const id of question.distractorEntryIds) ids.add(id);
  }
  return [...ids];
}

/**
 * Pick 3 distractors of the same POS, preferring the word's adaptive-pool
 * distractors, excluding any that would read as the same answer as the word
 * itself or as another chosen distractor. `label` picks the visible text:
 * the Chinese gloss for 英選中, the English word for 中選英.
 */
function pickDistractors(
  entry: VocabEntry,
  enriched: EnrichedEntry,
  label: (candidate: EnrichedEntry) => string,
): { entryId: string; label: string }[] {
  const candidates: EnrichedEntry[] = [];
  const seen = new Set<string>([entry.entryId]);
  const consider = (candidate: EnrichedEntry | undefined) => {
    if (!candidate || seen.has(candidate.entryId)) return;
    if (candidate.pos !== enriched.pos) return;
    seen.add(candidate.entryId);
    candidates.push(candidate);
  };

  // First choice: the curated adaptive-pool distractors.
  for (const id of clozePoolCandidates(enriched)) consider(getEnrichedEntry(id));
  // Then same-unit same-POS entries. Always appended, not only when the pool
  // looks short: a pool of 3 can lose members to the conflict filter below
  // (`section` tiers offer both `country` and `nation`, which collide).
  for (const candidate of pickSamePosFallback(entry, enriched)) {
    consider(candidate);
  }

  // Take candidates only when they conflict with neither the word itself nor
  // an already-taken distractor. A first pass keeps the question honest; it
  // can fall short in a small unit, so a second pass backfills and accepts
  // a conflict rather than sending three options (four is the contract).
  const chosen: EnrichedEntry[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= 3) break;
    if (conflictsAsOptions(enriched, candidate)) continue;
    if (chosen.some((taken) => conflictsAsOptions(taken, candidate))) continue;
    chosen.push(candidate);
  }
  for (const candidate of candidates) {
    if (chosen.length >= 3) break;
    if (chosen.some((taken) => conflictsAsOptions(taken, candidate))) continue;
    chosen.push(candidate);
  }
  return chosen.map((candidate) => ({
    entryId: candidate.entryId,
    label: label(candidate),
  }));
}

/** Pick 3 Chinese-gloss distractors of the same POS, excluding the answer. */
function pickDistractorZh(
  entry: VocabEntry,
  enriched: EnrichedEntry,
): { entryId: string; label: string }[] {
  return pickDistractors(entry, enriched, (candidate) => candidate.zh);
}

/** Pick 3 English-word distractors of the same POS, excluding the answer. */
function pickDistractorWords(
  entry: VocabEntry,
  enriched: EnrichedEntry,
): { entryId: string; label: string }[] {
  return pickDistractors(
    entry,
    enriched,
    (candidate) => getEntry(candidate.entryId)?.word ?? candidate.entryId,
  );
}

function pickSamePosFallback(
  entry: VocabEntry,
  enriched: EnrichedEntry,
): EnrichedEntry[] {
  const unit = entry.entryId.split(':')[0].slice(1);
  const all = getEnrichmentByUnit(unit);
  return all.filter(
    (e) => e.entryId !== entry.entryId && e.pos === enriched.pos,
  );
}

import { getEnrichment } from './data';

function getEnrichmentByUnit(unit: string): EnrichedEntry[] {
  return getEnrichment(unit)?.entries ?? [];
}

/** Build a full session of questions for the selected entries + type.
 *  `round` varies the question order and the type rotation between rounds
 *  of the same batch (see sessionOrder); default 0 keeps the legacy
 *  single-round behavior.
 *  `excludeSpelling` removes 拼字 from the mixed rotation — the 90-day plan
 *  review sessions use it (拼字不進計畫複習；一般練習仍可自選拼字).
 *  `progress` feeds the adaptive cloze pool: the mixed rotation's 填空 slot
 *  reads it to choose difficulty + the next unused variant, so it must be the
 *  LATEST progress (getSnapshot()), never a stale render-time value. Defaults
 *  to `{}` — callers that predate adaptive mixed cloze (and most tests) get
 *  first-time ('medium', variant 0) selection. */
export function buildSession(
  entries: VocabEntry[],
  type: QuestionType | 'mixed',
  round = 0,
  excludeSpelling = false,
  progress: Record<string, EntryProgress> = {},
): Question[] {
  const types: QuestionType[] =
    type === 'mixed'
      ? // 單字卡只給學新字用，不進混合輪替（複習也走 mixed，不應出單字卡）。
        excludeSpelling
        ? ['en2zh', 'zh2en', 'cloze']
        : ['en2zh', 'zh2en', 'cloze', 'spelling']
      : [type];
  const out: Question[] = [];
  const start = round % types.length;
  sessionOrder(entries, type, round).forEach((entry, i) => {
    const t = types[(i + start) % types.length];    const q = buildQuestion(entry, t, progress);
    if (q) out.push(q);
  });
  return out;
}

/**
 * Build a cloze session using the 5-question-per-word generator with
 * adaptive or fixed difficulty. Each entry produces exactly one cloze
 * question chosen by difficulty. `round` varies the question order between
 * rounds of the same batch (variant choice itself comes from progress).
 */
export function buildClozeSession(
  entries: VocabEntry[],
  difficulty: DifficultyMode,
  progress: Record<string, EntryProgress>,
  round = 0,
): Question[] {
  const out: Question[] = [];
  sessionOrder(entries, 'cloze', round).forEach((entry) => {
    const q = buildAdaptiveCloze(entry, difficulty, progress);
    if (q) out.push(q);
  });
  return out;
}

function buildAdaptiveCloze(
  entry: VocabEntry,
  difficulty: DifficultyMode,
  progress: Record<string, EntryProgress>,
): Question | null {
  const byDifficulty = clozeQuestionsForEntry(entry.entryId);
  let diff: Difficulty;
  if (difficulty === 'adaptive') {
    const p = progress[entry.entryId];
    diff = chooseDifficulty(p);
  } else {
    diff = difficulty;
  }

  // Fall back to any tier that has a question when the chosen one is empty,
  // so an entry with an incomplete pool still yields a question and a session
  // keeps one question per word. `validate-data` requires all three tiers, so
  // this only guards against a future unit shipping without one.
  let pool = byDifficulty[diff];
  if (pool.length === 0) {
    const filled = (['easy', 'medium', 'hard'] as const).filter(
      (tier) => byDifficulty[tier].length > 0,
    );
    if (filled.length === 0) return null;
    diff = filled[0];
    pool = byDifficulty[diff];
  }

  // Pick the next unused variant index.
  const p = progress[entry.entryId];
  const used = p?.clozeUsed?.[diff] ?? [];
  const vIdx = nextQuestionIndex(used, pool.length);
  const cloze = pool[vIdx < 0 ? 0 : vIdx];

  const distractors = cloze.distractorEntryIds.map((id) => {
    const e = getEntry(id);
    return { entryId: id, label: e?.word ?? id };
  });
  const options = shuffle(
    [{ entryId: cloze.answerEntryId, label: entry.word }, ...distractors],
    optionSeed(entry.entryId, 'cloze', `${diff}:${cloze.clue}`),
  );

  return {
    entryId: entry.entryId,
    type: 'cloze',
    prompt: cloze.sentence,
    options,
    answer: cloze.answerEntryId,
    context: {
      fullSentence: cloze.fullSentence,
      translation: cloze.translation,
      clue: cloze.clue,
    },
    clozeDifficulty: diff,
    clozeVariant: vIdx < 0 ? 0 : vIdx,
  };
}