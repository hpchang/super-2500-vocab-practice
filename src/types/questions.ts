/** Part of speech used for distractor compatibility. */
export type POS = 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase';

export type QuestionType =
  | 'flashcard'
  | 'en2zh' // English → choose Chinese
  | 'zh2en' // Chinese → choose English
  | 'cloze' // context fill-in-the-blank
  | 'spelling';

/** Content status for future editorial workflow. */
export type ContentStatus = 'draft' | 'reviewed';

export interface ClozeQuestion {
  /** Full sentence with a blank token, e.g. "Please close the ___." */
  sentence: string;
  /** The sentence with the answer filled in. */
  fullSentence: string;
  /** Traditional Chinese translation of the full sentence. */
  translation: string;
  /** Short clue shown after answering. */
  clue: string;
  /** The correct answer's entryId. */
  answerEntryId: string;
  /** Three distractor entryIds; all same POS as the answer. */
  distractorEntryIds: [string, string, string];
}

export interface EnrichedEntry {
  entryId: string;
  /** Traditional Chinese gloss. */
  zh: string;
  pos: POS;
  /** Short English example sentence. */
  example: string;
  /** Traditional Chinese translation of the example. */
  exampleZh: string;
  /** Spelling hint, e.g. "a-p-a-r-t-m-e-n-t" or first-letter cue. */
  spellingHint: string;
  status: ContentStatus;
  source: string;
  /** Legacy single cloze question (used by non-adaptive cloze, choice/spelling distractors). */
  cloze: ClozeQuestion;
  /** Cloze sentences for the easy tier (2 questions, cross-POS distractors). */
  clozeEasy: ClozeQuestion[];
  /** Cloze sentences for the medium tier (2 questions, same-POS distractors). */
  clozeMedium: ClozeQuestion[];
  /** Cloze sentence for the hard tier (1 question, semantically-near distractors). */
  clozeHard: ClozeQuestion;
}

export interface EnrichmentData {
  schemaVersion: number;
  unit: string;
  entries: EnrichedEntry[];
}