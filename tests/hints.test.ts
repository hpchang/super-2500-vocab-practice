import { describe, it, expect } from 'vitest';
import { progressiveHint, isMaxHint, MAX_HINT_LEVEL } from '../src/lib/hints.js';

describe('progressiveHint', () => {
  it('level 0 reveals only letter count + POS (no letters)', () => {
    const h = progressiveHint('apartment', 'noun', 0);
    expect(h).toBe('9 個字母 · 名詞');
    expect(h).not.toContain('a');
  });

  it('level 1 reveals the first letter only', () => {
    const h = progressiveHint('apartment', 'noun', 1);
    expect(h).toContain('開頭字母：a');
  });

  it('level 2 reveals roughly the first half as a dashed prefix', () => {
    const h = progressiveHint('apartment', 'noun', 2);
    // apartment has 9 letters; ceil(9/2)=5 → "a-p-a-r-t"
    expect(h).toContain('a-p-a-r-t');
    expect(h).toContain('…');
  });

  it('level 3 reveals the full dashed spelling', () => {
    const h = progressiveHint('apartment', 'noun', 3);
    expect(h).toBe('完整拼法：a-p-a-r-t-m-e-n-t');
  });

  it('preserves spaces in multi-word phrases using ␣', () => {
    const h = progressiveHint('living room', 'phrase', 3);
    expect(h).toBe('完整拼法：l-i-v-i-n-g-␣-r-o-o-m');
  });

  it('POS labels render in Chinese', () => {
    expect(progressiveHint('run', 'verb', 0)).toContain('動詞');
    expect(progressiveHint('quick', 'adjective', 0)).toContain('形容詞');
    expect(progressiveHint('here', 'adverb', 0)).toContain('副詞');
  });

  it('isMaxHint is true only at MAX_HINT_LEVEL', () => {
    expect(isMaxHint(0)).toBe(false);
    expect(isMaxHint(MAX_HINT_LEVEL)).toBe(true);
    expect(isMaxHint(MAX_HINT_LEVEL + 1)).toBe(true);
  });
});