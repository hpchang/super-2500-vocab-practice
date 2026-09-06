import { describe, expect, it } from 'vitest';
import {
  assembleAnswer,
  buildSpellPad,
  buildSpellSlots,
} from '../src/lib/spellKeys.js';

describe('buildSpellPad', () => {
  it('creates eight keys with the correct letter exactly once', () => {
    const pad = buildSpellPad('U1:apple', 'apple');

    for (const slot of pad.filter((item) => item.letterIndex !== null)) {
      const correct = slot.char.toUpperCase();
      expect(slot.keys).toHaveLength(8);
      expect(slot.keys.filter((key) => key === correct)).toHaveLength(1);
    }
  });

  it('uses seven distinct distractors that exclude the answer letter', () => {
    const pad = buildSpellPad('U1:apple', 'apple');

    for (const slot of pad.filter((item) => item.letterIndex !== null)) {
      const letters = slot.keys.map((key) => key.toLowerCase());
      expect(new Set(letters).size).toBe(8);
      expect(letters.filter((key) => key === slot.char.toLowerCase())).toHaveLength(1);
    }
  });

  it('keeps key order deterministic for the same entry and word', () => {
    const first = buildSpellPad('U7:through', 'through');
    const second = buildSpellPad('U7:through', 'through');

    expect(second).toEqual(first);
  });

  it('renders every keypad key in uppercase, including an all-uppercase word', () => {
    const pad = buildSpellPad('U1:AIDS', 'AIDS');

    expect(pad[0].keys).toContain('A');
    expect(pad.flatMap((slot) => slot.keys).every((key) => key === key.toUpperCase())).toBe(
      true,
    );
  });

  it('still supplies seven distractors for a one-letter word', () => {
    const pad = buildSpellPad('letter:a', 'a');

    expect(pad).toHaveLength(1);
    expect(pad[0].keys).toHaveLength(8);
    expect(new Set(pad[0].keys).size).toBe(8);
    expect(pad[0].keys.filter((key) => key === 'A')).toHaveLength(1);
  });
});

describe('buildSpellSlots', () => {
  it.each([
    ['space', 'a b', ['a', ' ', 'b']],
    ['hyphen', 'T-shirt', ['T', '-', 's', 'h', 'i', 'r', 't']],
    ['apostrophe', "ma'am", ['m', 'a', "'", 'a', 'm']],
    ['period', 'Mr.', ['M', 'r', '.']],
    ['slash', 'a/an', ['a', '/', 'a', 'n']],
  ])('makes the %s separator static', (_name, word, expectedChars) => {
    const slots = buildSpellSlots(word);

    expect(slots.map((slot) => slot.char)).toEqual(expectedChars);
    for (const slot of slots) {
      if (!/[a-zA-Z]/.test(slot.char)) {
        expect(slot.letterIndex).toBeNull();
      }
    }
  });

  it('makes the whole parenthesized section static and keeps indexing outside it', () => {
    const slots = buildSpellSlots('earring(s)');
    const staticPart = slots.slice(7);

    expect(slots.slice(0, 7).map((slot) => slot.letterIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(staticPart.map((slot) => slot.char)).toEqual(['(', 's', ')']);
    expect(staticPart.every((slot) => slot.letterIndex === null)).toBe(true);
  });

  it('keeps the slash static in a/an and counts only letters', () => {
    const slots = buildSpellSlots('a/an');

    expect(slots.map((slot) => slot.letterIndex)).toEqual([0, null, 1, 2]);
  });
});

describe('assembleAnswer', () => {
  it.each([
    ['T-shirt', ['T', 's', 'h', 'i', 'r', 't'], 'T-shirt'],
    ["ma'am", ['m', 'a', 'a', 'm'], "ma'am"],
    ['Mr.', ['M', 'r'], 'Mr.'],
    ['earring(s)', ['e', 'a', 'r', 'r', 'i', 'n', 'g'], 'earring(s)'],
  ])('restores the original shape for %s', (word, letters, expected) => {
    expect(assembleAnswer(word, letters)).toBe(expected);
  });

  it('uses entered characters for wrong answers and blanks null slots', () => {
    expect(assembleAnswer('T-shirt', ['X', 's', null, 'i', 'r', 't'])).toBe('X-sirt');
    expect(assembleAnswer('a/an', [null, 'x', 'y'])).toBe('/xy');
  });
});
