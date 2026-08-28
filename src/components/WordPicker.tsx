import { useMemo, useState } from 'react';
import type { VocabEntry } from '@/types/index';
import { isPracticable, getEnrichedEntry } from '@/lib/data';
import { useProgress, getEntryProgress } from '@/progressStore';

interface Props {
  entries: VocabEntry[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

/** Normalize for search: NFC, lowercase, collapse spaces. */
function norm(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function WordPicker({ entries, selected, onToggle }: Props) {
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

  const selectable = visible.filter((e) => isPracticable(e.entryId));
  const allSelected =
    selectable.length > 0 && selectable.every((e) => selected.has(e.entryId));

  const toggleAll = () => {
    // If everything visible is selected, clear the visible selection;
    // otherwise select all visible practiceable entries.
    for (const e of selectable) {
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

      <div className="word-list">
        {visible.length === 0 && (
          <div className="empty">沒有符合「{query}」的單字</div>
        )}
        {visible.map((e) => {
          const practicable = isPracticable(e.entryId);
          const p = getEntryProgress(progress, e.entryId);
          const disabled = !practicable;
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
            <label
              key={e.entryId}
              className={`word-row${disabled ? ' disabled' : ''}`}
              aria-disabled={disabled}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(e.entryId)}
                disabled={disabled}
              />
              <span className="word">
                {e.word}
                {e.important && <span className="imp"> ★</span>}
              </span>
              {!practicable && <span className="tag">尚未提供練習</span>}
              {stageLabel && <span className="tag">{stageLabel}</span>}
              {p.inWrongQueue && <span className="tag tag-wrong">錯題</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}