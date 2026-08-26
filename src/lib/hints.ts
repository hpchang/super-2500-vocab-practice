import type { POS } from '@/types/index';

/**
 * Multi-level progressive spelling hints.
 * Level 0: letter count + POS (no letters revealed)
 * Level 1: first letter only
 * Level 2: first ~half of the word as a dashed prefix
 * Level 3: the full dashed spelling
 *
 * The goal is to never give the answer away up front; the student must
 * ask for more help, one step at a time.
 */
export const MAX_HINT_LEVEL = 3;

const POS_ZH: Record<POS, string> = {
  noun: '名詞',
  verb: '動詞',
  adjective: '形容詞',
  adverb: '副詞',
  phrase: '片語',
};

/** Count letters, ignoring spaces (so "living room" → 10 letters). */
function letterCount(word: string): number {
  return word.replace(/\s/g, '').length;
}

/** First n characters of the word, preserving spaces, joined by dashes. */
function dashedPrefix(word: string, n: number): string {
  return word
    .slice(0, n)
    .split('')
    .map((ch) => (ch === ' ' ? '␣' : ch))
    .join('-');
}

/** Full spelling with dashes between letters; spaces shown as ␣. */
function dashedFull(word: string): string {
  return word
    .split('')
    .map((ch) => (ch === ' ' ? '␣' : ch))
    .join('-');
}

export function progressiveHint(word: string, pos: POS, level: number): string {
  const len = letterCount(word);
  const posZh = POS_ZH[pos] ?? '';
  switch (level) {
    case 0:
    default:
      return `${len} 個字母 · ${posZh}`;
    case 1:
      return `${len} 個字母 · ${posZh}；開頭字母：${word[0]}`;
    case 2: {
      // Reveal the first ~half of the letters, rounded up, min 2.
      const n = Math.max(2, Math.ceil(len / 2));
      return `字首提示：${dashedPrefix(word, n)}…`;
    }
    case 3:
      return `完整拼法：${dashedFull(word)}`;
  }
}

/** Whether the student has asked for all available hints. */
export function isMaxHint(level: number): boolean {
  return level >= MAX_HINT_LEVEL;
}