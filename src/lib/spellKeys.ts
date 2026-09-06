/**
 * Spelling-key hashing and shuffling are copied from src/lib/questions.ts.
 * Keep this pure and local rather than coupling to its private helpers.
 */

export interface SpellSlot {
  letterIndex: number | null;
  char: string;
  keys: string[];
}

/** A spelling slot for every character in the word, before keypad keys exist. */
export function buildSpellSlots(word: string): Omit<SpellSlot, 'keys'>[] {
  const chars = Array.from(word);
  const slots: Omit<SpellSlot, 'keys'>[] = [];
  let letterIndex = 0;
  let parenthesesDepth = 0;

  for (const char of chars) {
    const isOpeningParenthesis = char === '(';
    const isClosingParenthesis = char === ')';
    const isInParentheses = parenthesesDepth > 0;

    if (isOpeningParenthesis) parenthesesDepth++;

    if (!isInParentheses && !isOpeningParenthesis && /[a-zA-Z]/.test(char)) {
      slots.push({ letterIndex, char });
      letterIndex++;
    } else {
      slots.push({ letterIndex: null, char });
    }

    if (isClosingParenthesis && parenthesesDepth > 0) parenthesesDepth--;
  }

  return slots;
}

/** Build deterministic eight-key pads for each letter slot. */
export function buildSpellPad(entryId: string, word: string): SpellSlot[] {
  return buildSpellSlots(word).map((slot) => {
    if (slot.letterIndex === null) {
      return { ...slot, keys: [] };
    }

    const seed = hashString(`${entryId}:spelling:${slot.letterIndex}`);
    const correct = slot.char.toUpperCase();
    const distractors = shuffle(
      [...'abcdefghijklmnopqrstuvwxyz'].filter(
        (letter) => letter !== slot.char.toLowerCase(),
      ),
      seed,
    )
      .slice(0, 7)
      .map((letter) => letter.toUpperCase());

    return {
      ...slot,
      keys: shuffle([correct, ...distractors], seed),
    };
  });
}

/** Reinsert static characters while assembling the currently entered letters. */
export function assembleAnswer(
  word: string,
  letters: (string | null)[],
): string {
  return buildSpellSlots(word)
    .map((slot) =>
      slot.letterIndex === null
        ? slot.char
        : letters[slot.letterIndex] ?? '',
    )
    .join('');
}

/** Deterministic Fisher–Yates shuffle using the Mulberry32 PRNG. */
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

/** FNV-1a hash of a string, copied from src/lib/questions.ts. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
