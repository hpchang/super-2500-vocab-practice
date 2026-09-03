import { useMemo, useState } from 'react';
import type { VocabEntry } from '@/types/index';
import { getEnrichedEntry } from '@/lib/data';
import { useProgress, getEntryProgress } from '@/progressStore';
import {
  QUICK_FILTERS,
  applyQuickFilter,
} from '@/lib/quickFilters';

interface Props {
  entries: VocabEntry[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  /** 快捷鍵批量加入／取消（一次 setState，比逐筆 onToggle 快）。 */
  onSelectMany?: (ids: string[]) => void;
  onDeselectMany?: (ids: string[]) => void;
}

/** Normalize for search: NFC, lowercase, collapse spaces. */
function norm(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function WordPicker({
  entries,
  selected,
  onToggle,
  onSelectMany,
  onDeselectMany,
}: Props) {
  const progress = useProgress();
  const [query, setQuery] = useState('');
  const q = norm(query);

  // Search matches the English word or the enrichment Chinese meaning (P1-3).
  const visible = useMemo(() => {
    if (!q) return entries;
    return entries.filter((e) => {
      if (norm(e.word).includes(q)) return true;
      const zh = getEnrichedEntry(e.entryId)?.zh;
      return zh ? norm(zh).includes(q) : false;
    });
  }, [entries, q]);

  // 快捷鍵的 due 判定以套用當下為準；entries 換 Unit 時重算即可。
  const now = useMemo(() => Date.now(), [entries]);

  const allSelected =
    visible.length > 0 && visible.every((e) => selected.has(e.entryId));

  const toggleAll = () => {
    // If everything visible is selected, clear the visible selection;
    // otherwise select all visible entries.
    for (const e of visible) {
      if (allSelected === selected.has(e.entryId)) onToggle(e.entryId);
    }
  };

  return (
    <div className="word-picker">
      <div className="word-toolbar">
        <input
          type="search"
          className="word-search"
          placeholder="搜尋英文或中文…"
          aria-label="搜尋單字"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="word-tool-btn" onClick={toggleAll}>
          {allSelected ? '清除全選' : '全選'}
        </button>
        <span className="word-count">已選 {selected.size} 字</span>
      </div>

      {/* 快捷選取 chip：toggle 語意——整群未選時點擊＝全部勾選（要），
          整群已選時點擊＝整群取消（不要）。狀態由 selected 推導（群組在
          visible 範圍內是否全選），手動勾選可微調；部分選取時點擊補成全選。
          數量跟著搜尋範圍走（visible），0 個的快捷鍵停用。 */}
      <div className="quick-filter-row" role="group" aria-label="快捷選取">
        {QUICK_FILTERS.map((f) => {
          const ids = applyQuickFilter(visible, progress.entries, f.id, now);
          const count = ids.length;
          const groupAllSelected =
            count > 0 && ids.every((id) => selected.has(id));
          return (
            <button
              key={f.id}
              type="button"
              className={`quick-chip${groupAllSelected ? ' active' : ''}`}
              aria-pressed={groupAllSelected}
              disabled={count === 0 || !(onSelectMany && onDeselectMany)}
              onClick={() => {
                if (groupAllSelected) onDeselectMany?.(ids);
                else onSelectMany?.(ids);
              }}
            >
              {groupAllSelected && '✓ '}
              {f.label} · {count}
            </button>
          );
        })}
      </div>

      <div className="word-list">
        {visible.length === 0 && (
          <div className="empty">沒有符合「{query}」的單字</div>
        )}
        {visible.map((e) => {
          const p = getEntryProgress(progress, e.entryId);
          const isSelected = selected.has(e.entryId);
          const stageLabel =
            p.totalAnswered === 0
              ? ''
              : p.stage === 'new'
                ? '未練習'
                : p.stage === 'learning'
                  ? '學習中'
                  : p.stage === 'review'
                    ? '複習'
                    : '熟悉';
          return (
            <label key={e.entryId} className="word-row">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(e.entryId)}
              />
              <span className="word">
                {e.word}
                {e.important && <span className="imp"> ★</span>}
              </span>
              {stageLabel && <span className="tag">{stageLabel}</span>}
              {p.inWrongQueue && <span className="tag tag-wrong">錯題</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}