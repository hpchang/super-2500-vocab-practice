/** quickFilters 邏輯測試：各快捷鍵 predicate 與 countMatching 一致性。 */
import { describe, it, expect } from 'vitest';
import {
  applyQuickFilter,
  countMatching,
  QUICK_FILTERS,
} from '../src/lib/quickFilters.js';
import { makeInitialProgress } from '../src/lib/scheduler.js';
import type { EntryProgress, VocabEntry } from '../src/types/index.js';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function entry(word: string, important = false): VocabEntry {
  return {
    entryId: `u1:${word.toLowerCase()}`,
    termId: word,
    word,
    page: 1,
    important,
    unit: '1',
  };
}

function progressWith(patch: Partial<EntryProgress>): EntryProgress {
  // 真實流程答對必寫 nextReviewAt（間隔 ≥0.5 天，必在未來）；測試資料比照。
  // nextReviewAt: null 只會出現在從未作答的初始紀錄上，那種字對「待複習」
  // 恆為 due 是既有語意，與本組測試案例無關。
  return {
    ...makeInitialProgress('u1:x'),
    totalAnswered: 1,
    nextReviewAt: NOW + DAY / 2,
    ...patch,
  };
}

const ENTRIES = [
  entry('sun', true), // 3 letters, important
  entry('book'), // 4
  entry('apple'), // 5
  entry('banana', true), // 6, important
  entry('apartment'), // 9
  entry('refrigerator'), // 12
];
const ids = (words: string[]) => words.map((w) => `u1:${w}`);

describe('quickFilters', () => {
  describe('short word tiers (mutually exclusive length bins)', () => {
    const empty = {};
    it('字 ≤4: 4 letters in, 5 out', () => {
      expect(applyQuickFilter(ENTRIES, empty, 'short4', NOW)).toEqual(
        ids(['sun', 'book']),
      );
    });
    it('字 5–6: excludes ≤4 and ≥7', () => {
      expect(applyQuickFilter(ENTRIES, empty, 'short6', NOW)).toEqual(
        ids(['apple', 'banana']),
      );
    });
    it('字 ≥7: long words only — 7 letters in, ≤6 and 9+ all in', () => {
      // Fixture has no ≥7 word except apartment/refrigerator; pin with a
      // 7-letter word and confirm the bin includes everything ≥7.
      const entries = [...ENTRIES, entry('village')]; // 7 letters
      expect(applyQuickFilter(entries, empty, 'long', NOW)).toEqual(
        ids(['apartment', 'refrigerator', 'village']),
      );
    });
  });

  describe('progress-based filters', () => {
    const progress: Record<string, EntryProgress> = {
      'u1:sun': progressWith({ stage: 'strong' }), // familiar
      'u1:book': progressWith({ stage: 'learning', nextReviewAt: NOW - 100 }), // due
      'u1:apple': progressWith({ stage: 'review', nextReviewAt: NOW + DAY }), // not yet due
      'u1:banana': progressWith({ stage: 'review', inWrongQueue: true }), // wrong queue
      // apartment: no progress record → unpracticed
      'u1:refrigerator': progressWith({ stage: 'strong' }),
    };

    it('待複習: overdue only — future reviews and wrong-queue words not included', () => {
      // 沿用 selection 的語意：isDueForReview 只看到期時間；錯題字（複習
      // 時間在未來但 inWrongQueue）不在「待複習」，要選錯題用「錯題」快捷鍵。
      expect(applyQuickFilter(ENTRIES, progress, 'review', NOW)).toEqual(
        ids(['book']),
      );
      // 錯題字若到期仍應包含（inWrongQueue 與到期是獨立條件）
      const overdueWrong = {
        ...progress,
        'u1:banana': progressWith({ stage: 'review', inWrongQueue: true, nextReviewAt: NOW - 100 }),
      };
      expect(applyQuickFilter(ENTRIES, overdueWrong, 'review', NOW)).toEqual(
        ids(['book', 'banana']),
      );
    });

    it('學習中 excludes unpracticed and other stages', () => {
      // book is stage learning (totalAnswered set by progressWith)
      const learningOnly = applyQuickFilter(ENTRIES, progress, 'learning', NOW);
      expect(learningOnly).toEqual(ids(['book']));
      // a stage:'new' record with answers still counts as 未練習-ish, excluded
      const progress2 = {
        ...progress,
        'u1:sun': progressWith({ stage: 'new', totalAnswered: 5 }),
      };
      expect(applyQuickFilter(ENTRIES, progress2, 'learning', NOW)).toEqual(
        ids(['book']),
      );
    });

    it('未練習: no record or totalAnswered 0', () => {
      // 只有 refrigerator 有紀錄且 0 題作答（初始紀錄）；其餘五字無紀錄，
      // 全部視為未練習。有作答紀錄的字（progress fixture）不會出現。
      const progress2 = {
        'u1:refrigerator': makeInitialProgress('u1:refrigerator'), // 0 answered
      };
      expect(applyQuickFilter(ENTRIES, progress2, 'unpracticed', NOW)).toEqual(
        ids(['sun', 'book', 'apple', 'banana', 'apartment', 'refrigerator']),
      );
      // 練過的字不算未練習
      const practiced: Record<string, EntryProgress> = {
        'u1:book': progressWith({ stage: 'learning', nextReviewAt: NOW - 100 }),
      };
      expect(applyQuickFilter(ENTRIES, practiced, 'unpracticed', NOW)).toEqual(
        ids(['sun', 'apple', 'banana', 'apartment', 'refrigerator']),
      );
    });

    it('錯題: only inWrongQueue', () => {
      expect(applyQuickFilter(ENTRIES, progress, 'wrong', NOW)).toEqual(
        ids(['banana']),
      );
    });

    it('還不熟 excludes strong, includes learning/review stages', () => {
      expect(applyQuickFilter(ENTRIES, progress, 'notstrong', NOW)).toEqual(
        ids(['book', 'apple', 'banana']),
      );
    });

    it('重要字 matches e.important regardless of progress', () => {
      expect(applyQuickFilter(ENTRIES, progress, 'important', NOW)).toEqual(
        ids(['sun', 'banana']),
      );
    });

    it('countMatching agrees with applyQuickFilter for every filter', () => {
      for (const f of QUICK_FILTERS) {
        const idsSelected = applyQuickFilter(ENTRIES, progress, f.id, NOW);
        expect(countMatching(ENTRIES, progress, f.id, NOW)).toBe(
          idsSelected.length,
        );
      }
      expect(progress[ENTRIES[0].entryId]).toBeDefined(); // sanity: fixture used
    });
  });
});