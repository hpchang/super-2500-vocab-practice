import type {
  QuestionType,
  VocabEntry,
  EnrichedEntry,
  POS,
} from '@/types/index';
import { getEnrichedEntry, getEntry } from './data';

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
}

const SHUFFLE_SEED_STEPS = 17;

/** Deterministic pseudo-shuffle so the same batch is stable per session index. */
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

export function buildQuestion(
  entry: VocabEntry,
  type: QuestionType,
  index: number,
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
        index + 1,
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
        index + 2,
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
      // Cloze sentences are English; options must be English words so the
      // student picks the word that fits the blank grammatically.
      const c = enriched.cloze;
      const distractors = c.distractorEntryIds.map((id) => {
        const e = getEntry(id);
        return { entryId: id, label: e?.word ?? id };
      });
      const options = shuffle(
        [{ entryId: c.answerEntryId, label: entry.word }, ...distractors],
        index + 3,
      );
      return {
        entryId: entry.entryId,
        type,
        prompt: c.sentence,
        options,
        answer: c.answerEntryId,
        context: {
          fullSentence: c.fullSentence,
          translation: c.translation,
          clue: c.clue,
        },
      };
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

/** Pick 3 Chinese-gloss distractors of the same POS, excluding the answer. */
function pickDistractorZh(
  entry: VocabEntry,
  enriched: EnrichedEntry,
): { entryId: string; label: string }[] {
  // Prefer cloze distractors (already curated, same POS).
  const clozeDistractors = enriched.cloze.distractorEntryIds
    .map((id) => getEnrichedEntry(id))
    .filter((e): e is EnrichedEntry => Boolean(e))
    .map((e) => ({ entryId: e.entryId, label: e.zh }));
  if (clozeDistractors.length >= 3) return clozeDistractors.slice(0, 3);
  // Fallback: same-POS enriched entries in the same unit.
  return pickSamePosFallback(entry, enriched).map((e) => ({
    entryId: e.entryId,
    label: e.zh,
  }));
}

/** Pick 3 English-word distractors of the same POS, excluding the answer. */
function pickDistractorWords(
  entry: VocabEntry,
  enriched: EnrichedEntry,
): { entryId: string; label: string }[] {
  const clozeDistractors: { entryId: string; label: string }[] = [];
  for (const id of enriched.cloze.distractorEntryIds) {
    const e = getEntry(id);
    if (e) clozeDistractors.push({ entryId: id, label: e.word });
  }
  if (clozeDistractors.length >= 3) return clozeDistractors.slice(0, 3);
  return pickSamePosFallback(entry, enriched).map((e) => {
    const v = getEntry(e.entryId);
    return { entryId: e.entryId, label: v?.word ?? e.entryId };
  });
}

function pickSamePosFallback(
  entry: VocabEntry,
  enriched: EnrichedEntry,
): EnrichedEntry[] {
  const unit = entry.entryId.split(':')[0].slice(1);
  const all = getEnrichmentByUnit(unit);
  return all
    .filter((e) => e.entryId !== entry.entryId && e.pos === enriched.pos)
    .slice(0, 3);
}

import { getEnrichment } from './data';

function getEnrichmentByUnit(unit: string): EnrichedEntry[] {
  return getEnrichment(unit)?.entries ?? [];
}

/** Build a full session of questions for the selected entries + type. */
export function buildSession(
  entries: VocabEntry[],
  type: QuestionType | 'mixed',
): Question[] {
  const types: QuestionType[] =
    type === 'mixed'
      ? ['en2zh', 'zh2en', 'cloze', 'spelling', 'flashcard']
      : [type];
  const out: Question[] = [];
  entries.forEach((entry, i) => {
    const t = types[i % types.length];
    const q = buildQuestion(entry, t, i);
    if (q) out.push(q);
  });
  return out;
}

export { SHUFFLE_SEED_STEPS };