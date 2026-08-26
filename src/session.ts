import type { QuestionType } from '@/types/index';
import type { DifficultyMode } from '@/lib/questions';

const KEY = 'vocab-super2500-session';
const RESULT_KEY = 'vocab-super2500-lastresult';

export interface SessionConfig {
  unit: string;
  entryIds: string[];
  type: QuestionType | 'mixed';
  batchSize: number;
  /** Cloze difficulty mode; only used when type is 'cloze'. */
  difficulty?: DifficultyMode;
}

export interface SessionResult {
  unit: string;
  type: QuestionType | 'mixed';
  results: { entryId: string; type: QuestionType; correct: boolean }[];
}

export function saveSession(cfg: SessionConfig): void {
  sessionStorage.setItem(KEY, JSON.stringify(cfg));
}

export function loadSession(): SessionConfig | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionConfig;
  } catch {
    return null;
  }
}

export function saveResult(r: SessionResult): void {
  sessionStorage.setItem(RESULT_KEY, JSON.stringify(r));
}

export function loadResult(): SessionResult | null {
  const raw = sessionStorage.getItem(RESULT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionResult;
  } catch {
    return null;
  }
}