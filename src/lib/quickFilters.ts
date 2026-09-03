/** WordPicker 快捷選取：一鍵批量勾選特定群組（短字／待複習／學習中…）。
 *
 *  這是勾選輔助（apply-on-click），不是 FilterMode——選取仍是自訂模式，
 *  快捷鍵把符合的單字「加入」選取；要「只選這一群」先按「清除全選」再套用。
 */

import type { VocabEntry, EntryProgress } from '@/types/index';
import { isDueForReview } from '@/lib/selection';

export type QuickFilterId =
  | 'short4'
  | 'short6'
  | 'long'
  | 'review'
  | 'learning'
  | 'important'
  | 'unpracticed'
  | 'wrong'
  | 'notstrong';

export interface QuickFilter {
  id: QuickFilterId;
  /** Chip 上顯示的文字。 */
  label: string;
  /** 符合條件。p 可能沒有進度紀錄（undefined）。 */
  match: (e: VocabEntry, p: EntryProgress | undefined, now: number) => boolean;
}

/** 快捷鍵清單（chip 顯示順序）。「待複習」沿用 selection 的 isDueForReview
 *  ——它含 stage 'new' 的未練習字（從未練＝1 天後就該複習的語意）；
 *  「學習中」則明確排除未練習字。 */
export const QUICK_FILTERS: QuickFilter[] = [
  // 短字三檔互斥（長度分箱，非疊加範圍）：≤4 / 5–6 / ≥7（長字）。
  { id: 'short4', label: '字 ≤4', match: (e) => e.word.length <= 4 },
  { id: 'short6', label: '字 5–6', match: (e) => e.word.length >= 5 && e.word.length <= 6 },
  { id: 'long', label: '字 ≥7（長字）', match: (e) => e.word.length >= 7 },
  { id: 'review', label: '待複習', match: (_e, p, now) => !!p && isDueForReview(p, now) },
  {
    id: 'learning',
    label: '學習中',
    match: (_e, p) => !!p && p.totalAnswered > 0 && p.stage === 'learning',
  },
  { id: 'important', label: '重要字★', match: (e) => e.important },
  {
    id: 'unpracticed',
    label: '未練習',
    match: (_e, p) => !p || p.totalAnswered === 0,
  },
  { id: 'wrong', label: '錯題', match: (_e, p) => !!p?.inWrongQueue },
  {
    id: 'notstrong',
    label: '還不熟',
    match: (_e, p) => !!p && p.totalAnswered > 0 && p.stage !== 'strong',
  },
];

export function getQuickFilter(id: QuickFilterId): QuickFilter {
  const f = QUICK_FILTERS.find((q) => q.id === id);
  if (!f) throw new Error(`Unknown quick filter: ${id}`);
  return f;
}

/** 符合快捷鍵的 entryIds（保持 workbook 字母序）。 */
export function applyQuickFilter(
  entries: VocabEntry[],
  progress: Record<string, EntryProgress>,
  filterId: QuickFilterId,
  now: number,
): string[] {
  const f = getQuickFilter(filterId);
  return entries
    .filter((e) => f.match(e, progress[e.entryId], now))
    .map((e) => e.entryId);
}

/** 符合快捷鍵的單字數（chip 顯示用）。 */
export function countMatching(
  entries: VocabEntry[],
  progress: Record<string, EntryProgress>,
  filterId: QuickFilterId,
  now: number,
): number {
  const f = getQuickFilter(filterId);
  return entries.filter((e) => f.match(e, progress[e.entryId], now)).length;
}